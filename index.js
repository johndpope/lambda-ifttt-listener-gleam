const AWS = require('aws-sdk')
AWS.config.update({region: 'eu-west-1'})
const axios = require('axios')
const crypto = require('crypto')
const Entities = require('html-entities').XmlEntities
const entities = new Entities()
const SQS = new AWS.SQS()

exports.handler = async ({ body }, _, callback) => {
  try {
    await processCompetition(body)
  } catch (e) {
    console.log('Processing failed.', e)
  }

  return callback(null, {
    statusCode: 202,
    headers: { 'Access-Control-Allow-Origin': '*' }
  })
}

const processCompetition = async (body) => {
  console.log('Received new competition', body)

  // Fetches gleam.io competition.
  const { url, data } = await fetchContents(body)

  // Parses number of entrants out of html.
  let entrants = null
  try {
    entrants = /initEntryCount\((\d+)\)/.exec(data)[1]
  } catch(_) {}

  // Gets the competition object out of html.
  const info = JSON.parse(entities.decode(/initCampaign\((.*)\)/.exec(data)[1]))

  // Generate promoterId from site url.
  const promoterId = crypto.createHash('sha256').update(info.campaign.site_url).digest('hex')

  // Image object.
  let media = info.incentives.find(i => i.url || i.medium_url)

  if (!media) {
    throw new Error('Competition image is required.')
  }

  // Adapts the fetched data to our competition persister.
  const competition = {
    entrants,
    source_id: process.env.SOURCE_ID,
    media: media.url || media.medium_url,
    entry_methods: getEntryMethods(info.entry_methods),
    end_date: new Date(info.campaign.ends_at * 1000).toISOString(),
    data: {
      resource: {
        resource_id: url,
        text: info.campaign.name,
        posted: info.campaign.starts_at * 1000
      },
      promoter: {
        homepage: info.campaign.site_url,
        resource_id: promoterId,
        screen_name: info.campaign.site_name,
        name: info.campaign.site_name,
        thumbnail: `https://www.google.com/s2/favicons?domain=${info.campaign.site_url}`
      }
    }
  }

  // Pushes message to the SQS queue.
  await SQS.sendMessage({
    MessageBody: JSON.stringify({
      region_id: getRegionId(info.campaign.terms_and_conditions),
      competitions: [ competition ],
      method: 'POST'
    }),
    QueueUrl: process.env.PERSISTOR_QUEUE_URL,
    MessageGroupId: Date.now() + []
  }).promise()
}

/**
 * Fetches gleam.io competition html.
 *
 * @param {string} url
 */
const fetchContents = (url) => {
  return new Promise(async (resolve) => {
    let { data, request } = await axios.get(url)

    url = request.path

    if (!request.res.responseUrl.startsWith('https://gleam.io')) {
      url = /(href|src)="https:\/\/gleam\.io\/(([a-z0-9]+?)\/([a-z0-9-]+?))"/gmi
        .exec(data)[2]

      data = (await axios.get(`https://gleam.io/${url}`)).data
    }

    url = url
      .replace(/\?.*$/gi)
      .replace(/^\//, '')

    return resolve({ data, url })
  })
}

/**
 * Determines the region id based on location regex search.
 *
 * @param {string} text
 *
 * @return {boolean}
 */
const getRegionId = (text) => {
  const sources = [
    {
      regex: [
        /canada/gmi,
        /\sCA\s/gm
      ],
      id: 4
    },
    {
      regex: [
        /\saus\s|australia/gmi,
      ],
      id: 3
    },
    {
      regex: [
        /united\sstates|\susa\s|america/gmi,
        /\s(US|U\.S\.)\s/gm
      ],
      id: 2
    },
    {
      regex: [
        /.*/
      ],
      id: 1
    }
  ]

  return sources.find(({ regex }) => regex.some(reg => reg.test(text))).id
}

/**
 * Gets list of entry methods.
 *
 * @param {any[]} methods
 *
 * @return {string[]}
 */
const getEntryMethods = (methods) => {
  return Array.from(new Set(methods.map(method => method.entry_type)))
}

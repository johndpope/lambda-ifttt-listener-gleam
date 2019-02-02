const AWS = require('aws-sdk')
const s3 = new AWS.S3()

module.exports = () => {
  return s3
    .getObject({
      Bucket: process.env.BLACKLIST_BUCKET,
      Key: process.env.BLACKLIST_KEY
    })
    .promise()
    .then(({ Body }) => Body.toString('utf-8'))
    .then(JSON.parse)
    .then(({ promoters }) => promoters.gleam.map(pattern => new RegExp(pattern, 'gi')))
}

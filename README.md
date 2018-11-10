# AWS Lambda: Twitter Scraper

Fetches tweets, parses them and pushes them to an SQS.

The event object has to be of following structure:

```
event.Records[0].Sns.message = {
    ...
    "region_id": Integer,
    "since_id": String,
    "params": Object
}
```

## Deployment
Deploy with `npm run deploy:{env}`.

## Tests
Yet to be written.
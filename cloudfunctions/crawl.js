const { crawl } = require('./business')

exports.crawl = async (event, context) => {
  await crawl({ event, context })
}

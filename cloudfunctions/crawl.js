const { crawl } = require('./business')

exports.crawl = async (event, context) => {
  console.log('----received crawl demand')
  await crawl({ event, context })
}

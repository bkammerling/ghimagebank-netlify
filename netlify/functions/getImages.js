// imagebank initialization
const {MongoClient} = require('mongodb');
const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;
const maximumNumberOfResults = 30;

let status = "",
    output = {};

exports.handler = async event => {
  const query = event.queryStringParameters;
  const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    output = await findImages(client);
    status = 200;
  } catch(e) {
    console.log(e);
    status = 404;
  }
  return {
    headers: {
      "Access-Control-Allow-Origin": "*"
    },
    statusCode: status,
    body: JSON.stringify(output)
  }
}


async function findImages(client, query = {} ) {
  const cursor = client.db("image_bank").collection("images").find({})
    .sort({ dateupload: -1 })
    .limit(maximumNumberOfResults);
  const results = await cursor.toArray();

  if (results.length > 0) {
    console.log(`Found ${results.length} item(s).`);
    results.forEach((result, i) => {
        const date = new Date().toDateString();
        console.log(`${i + 1}. name: ${result.title}`);
        console.log(`   _id: ${result._id}`);
    });
  } else {
      console.log(`No items found`);
  }
  return results;
}
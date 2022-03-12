// imagebank initialization
const {MongoClient} = require('mongodb');
const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;
let output;

exports.handler = async event => {
  const client = new MongoClient(uri);
  const image = JSON.parse(event.body);
  try {
    await client.connect();
    output = await insertDocument(client, image.id);
    status = 200;
  } catch(e) {
    console.log(e);
    status = 404;
  } finally {
    await client.close();
  }
  return {
    headers: {
      "Access-Control-Allow-Origin": "*"
    },
    statusCode: status,
    body: JSON.stringify(output)
  }
}

async function insertDocument(client, _id) {
  const result = await client.db("image_bank").collection("images").deleteOne({ "_id": _id });
  return result;
}
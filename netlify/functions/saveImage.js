// imagebank initialization
const {MongoClient} = require('mongodb');
const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;
let output;

exports.handler = async (event, context) => {
  const client = new MongoClient(uri);
  const wholeImage = JSON.parse(event.body);
  // const wholeImage = {"_id":"51879885628","id":"51879885628","secret":"fb5ce614da","server":"65535","farm":66,"title":"RE0021-Reign-Non-Ambassador-4SKU-250ml-NL-Header-1020x400px-v2","o_width":"1500","o_height":"588","dateupload":"1644781357","url_o":"https://live.staticflickr.com/65535/51879885628_db2391a855_o.jpg","height_o":588,"width_o":1500,"lastModified":"2022-02-21T23:47:45.562Z","dateInserted":"2022-02-21T23:47:45.562Z"}
  // extract just the id and title as they're the only possible updates
  const imageToUpdate = (({ _id, title }) => ({ _id, title }))(wholeImage);
  try {
    await client.connect();
    output = await updateById(client, imageToUpdate._id, imageToUpdate);
    status = 200;
  } catch(e) {
    console.log('in save image error');
    console.log(e);
    status = 404;
  } finally {
    await client.close();
  }
  return {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    statusCode: status,
    body: JSON.stringify(output)
  }
}


async function updateById(client, _id, document) {
  document.lastModified = new Date();
  const result = await client.db("image_bank").collection("images").updateOne({ "_id": _id }, 
    [{
      $set: document
    }]);
  return result;
}
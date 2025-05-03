// imagebank initialization
const {MongoClient} = require('mongodb');
const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;

exports.handler = async (event, context) => {
   // Handle CORS preflight
   if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Or your domain
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod === 'POST') {
    // DB update logic 
    const { jobNumber, brand } = JSON.parse(event.body);
    console.log(`Brand: ${brand}`);
    console.log(`Job Number: ${jobNumber}`);

    let statusCode;
    const filter = {
      $and: [
        { brand: { $exists: false } },
        { title: { $regex: `^${jobNumber}.*`}}
      ]
    }
    try {
      await client.connect();
      const response = await client.db("image_bank").collection("images")
        .updateMany(filter, { $set: { brand: brand } });
      output = {
        modifiedCount: response.modifiedCount,
        matchedCount: response.matchedCount
      };
      statusCode = 200;
    } catch(e) {
      console.log(e);
      statusCode = 404;
    } finally {
      await client.close();
    }
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ status: 'success', modifiedImages: output.modifiedCount, matchedImages: output.matchedCount }),
    };
  }

  return {
    statusCode: 405,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    body: 'Method Not Allowed',
  };
 
}
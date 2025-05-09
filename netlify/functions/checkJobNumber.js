// imagebank initialization
const {MongoClient} = require('mongodb');
const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;

exports.handler = async (event, context) => {
  const jobNumber = event.queryStringParameters.jobNumber;
  if(!jobNumber) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'jobNumber is required' }),
    };
  }
  const client = new MongoClient(uri);
  let output = {};
  let status;
  
  try {
    await client.connect();
    const filter = {
        title: { $regex: `^${jobNumber}\\d\\d`}
    }
    const filterWithoutBrand = {
      $and: [
        { brand: { $exists: false } },
        { title: { $regex: `^${jobNumber}\\d\\d`}}
      ]
    }
    const [count, countWithoutBrand] = await Promise.all([
      client.db("image_bank").collection("images").countDocuments(filter),
      client.db("image_bank").collection("images").countDocuments(filterWithoutBrand)
    ]);
    output = {
      count,
      countWithoutBrand
    };
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

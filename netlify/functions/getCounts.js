// imagebank initialization
const {MongoClient} = require('mongodb');
const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;

exports.handler = async (event, context) => {
  const client = new MongoClient(uri);
  let output = {};
  let status;
  
  try {
    await client.connect();
    // do all fetches in parallel with promise.all
    const [total, lastWeek, lastMonth] = await Promise.all([getTotalImages(client), getWeekImages(client), getMonthImages(client)]);
    output = {
      total,
      lastWeek,
      lastMonth
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

async function getTotalImages(client) {
  const result = await client.db("image_bank").collection("images").countDocuments();
  return result;
}

async function getWeekImages(client) {
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const result = await client.db("image_bank").collection("images").countDocuments({
    dateInserted: {
      $gte: lastWeek
    }
  });
  return result;
}

async function getMonthImages(client) {
  const lastMonth = new Date();
  lastMonth.setDate(lastMonth.getDate() - 30);
  const result = await client.db("image_bank").collection("images").countDocuments({
    dateInserted: {
      $gte: lastMonth
    }
  });
  return result;
}
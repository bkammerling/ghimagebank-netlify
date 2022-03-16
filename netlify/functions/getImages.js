// imagebank initialization
const {MongoClient} = require('mongodb');
const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;
const maximumNumberOfResults = 30;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;
let output;

exports.handler = async event => {
  const query = event.queryStringParameters;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    output = await findImages(client, query);
    status = 200;
  } catch(e) {
    console.log(e);
    status = 404;
  } finally {
    await client.close();
  }
  return {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    },
    statusCode: status,
    body: JSON.stringify(output)
  }
}


async function findImages(client, query = {} ) {
  // Set up filter from query object
  const page = query.p,
        parent = query.parent,
        search = query.search,
        country = query.country,
        brand = query.brand,
        dates = query.dates,
        los = query.los,
        ren = query.ren;
  let filter = { $and: []};

  filter.$and.push({ brand: parent });

  if(search) {
    const searchRegExp = new RegExp(`(?=.*${search.split(' ').join(')(?=.*')}).*`, 'i');
    filter.$and.push({ title: searchRegExp });
  }

  const countryRegExp = new RegExp(country);
  filter.$and.push({ title: countryRegExp });

  const brandRegExp = new RegExp('^'+brand+'(Ren)?\\d\\d');
  if(typeof brand !== 'undefined' && brand.length >= 1) filter.$and.push({ title: brandRegExp});

  const losRegExp = new RegExp('LOS');
  if(los === "true") filter.$and.push({ title: losRegExp});

  const renRegExp = new RegExp(/^\w{1,3}Ren./);
  if(ren === "true") filter.$and.push({ title: renRegExp});

  if(typeof dates !== 'undefined' && dates.length > 20) {
    //make sure dates is defined and isn't NaN (20 ensures we have actual data)
    const unixDates = dates.split(",").map(date => new Date(date).getTime() / 1000);
    console.log(unixDates);
    filter.$and.push({
      dateupload: {
        $gte: unixDates[0],
        $lte: unixDates[1]
      }
    });
  }

  const cursor = client.db("image_bank").collection("images").find(filter)
    .sort({ dateupload: -1 })
    .skip( page > 0 ? ( ( page - 1 ) * maximumNumberOfResults ) : 0 )
    .limit(maximumNumberOfResults);
  const images = await cursor.toArray();
  const count = await client.db("image_bank").collection("images").count(filter);
  console.log(`Found ${count} item(s).`);
  return { count, images };

}
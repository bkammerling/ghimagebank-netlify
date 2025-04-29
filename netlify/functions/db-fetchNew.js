const {MongoClient} = require('mongodb');
const admin = require("firebase-admin");

if (!admin.apps.length) {
  
  admin.initializeApp({
    credential: admin.credential.cert({
      "projectId": process.env.FIREBASE_PROJECT_ID,
      "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: "https://good-humans-timesheet.firebaseio.com"
  });  
}

const Flickr = require('flickr-sdk');

const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;

const flickr = new Flickr(Flickr.OAuth.createPlugin(
  process.env.FLICKR_API_KEY,
  process.env.FLICKR_API_SECRET,
  process.env.FLICKR_OAUTH_TOKEN,
  process.env.FLICKR_OAUTH_TOKEN_SECRET
));
const oauth = new Flickr.OAuth(
  process.env.FLICKR_API_KEY,
  process.env.FLICKR_API_SECRET
);
const flickrPerPage = 100;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;
let imagesInserted = 0;

exports.handler = async event => {
  const query = event.queryStringParameters;
  const client = new MongoClient(uri);
  // Page 1 as it gets latest uploaded images first
  let page = 1;
  const brandObj = await fetchBrands();
  const response = await addFlickrPhotosToMongoDB(client, page, brandObj);
  console.log('Final response from loop: ', response);
  return {
    headers: {
      "Access-Control-Allow-Origin": "*"
    },
    statusCode: 200,
    body: JSON.stringify({ imagesInserted, status: response.status })
  }
};

async function addFlickrPhotosToMongoDB(client, page, brandObj) {
  console.log(`Starting API call to Flickr page ${page}`);
  const flickrResponse = await flickr.people.getPhotos({
    user_id: '25964651@N03',
    extras: 'date_upload, o_dims, url_o',
    per_page: flickrPerPage,
    page: page
  });
  // Throw error if there are any in the response
  if (flickrResponse.errors !== undefined && flickrResponse.errors.length) throw new Error(response.errors);
  // Get photos from flickr response body
  const imagesReturned = flickrResponse.body.photos.photo;
  console.log('flickr length: ', imagesReturned.length)
  // Prepare images for insertion into MongoDB
  const imagesToInsert = imagesReturned.map(doc => {
    doc._id = doc.id;
    doc.dateupload = parseInt(doc.dateupload);
    doc.lastModified = new Date();
    doc.dateInserted = new Date();
    for (const [key, value] of Object.entries(brandObj)) {
      // brand code must match, followed by 2 numbers (so BURN-B doesn't catch Babyjogger-BJ) 
      const regex = new RegExp(`^(${value.join("|")})\\d\\d`)
      if(regex.test(doc.title)) doc.brand = key
    }  
    delete doc.isfriend;
    delete doc.isprimary;
    delete doc.ispublic;
    delete doc.isfamily;
    return doc;
  })
  const dbResponse = await insertManyImages(client, imagesToInsert);
  console.log(`Done page ${page}`);
  console.log('dbResponse: ', dbResponse);
  imagesInserted += dbResponse.inserted || 0;
  // Check to see if we need to fetch more images, max pages for this call is 20
  if(dbResponse.inserted === imagesReturned.length && page+1 <= 20) {
    // all images were inserted - so let's keep fetching more images from Flickr
    console.log('Running again');
    await addFlickrPhotosToMongoDB(client, page+1, brandObj);
  } else if(dbResponse.inserted < imagesReturned.length) {
    // suggests that we've reached images that are already in the DB
    console.log(`Inserted less than returned at page ${page}`)
    return { lastPageInsertedCount: dbResponse.inserted, page: page, status: dbResponse.status }
  } 
}

const insertManyImages = async (client, newImages) => {
  let returnObject = {
    inserted: 0,
    status: null,
  };
  try {
    await client.connect();
    const result = await client.db("image_bank").collection("images").insertMany(newImages, { ordered: false });
    console.log('Mongo result insertedCount: ', result.insertedCount);
    // If no error, all images were inserted successfully
    returnObject.inserted = result.insertedCount;
    returnObject.status = "Success";
  } catch(e) {
    console.log('Write Error: ' + e.code);
    if(e.code === 11000) console.log('Expected duplicate ID error');
    if(e.result?.nInserted < newImages.length) {
      // Some images weren't inserted - likely duplicates, stop fetching images
      const {writeErrors, insertedIds, ...logObj} = e.result.result;
      console.log(logObj)
      returnObject.inserted = e.result.nInserted;
      returnObject.status = `Success: ${e.code}`
    } else {
      console.log(e.result)
      returnObject.status = `Error: ${e.code}`;
    }
  } finally {
    return returnObject;
  }
}

const fetchBrands = async () => {
  const db = admin.database();
  const ref = db.ref("/imagebank/brands_2022");
  const snapshot = await ref.once("value");
  const brandsObj = snapshot.val(); 
  // Convert into object we can use to check images against { parentBrand: [ label1, label2], ... }
  let parentObj = {};
  Object.values(brandsObj).map(e => {
    if(e.parent === "") return;
    if(!parentObj[e.parent]) { 
      parentObj[e.parent] = [e.label];
    } else {
      parentObj[e.parent].push(e.label);
    }
    return false;
  })
  return parentObj;
}
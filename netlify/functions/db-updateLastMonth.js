const {MongoClient} = require('mongodb');
const Flickr = require('flickr-sdk');
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


const DB_USER = process.env.DB_USER,
      DB_PASS = process.env.DB_PASS;

const flickr = new Flickr(Flickr.OAuth.createPlugin(
  process.env.FLICKR_API_KEY,
  process.env.FLICKR_API_SECRET,
  process.env.FLICKR_OAUTH_TOKEN,
  process.env.FLICKR_OAUTH_TOKEN_SECRET
));

const flickrPerPage = 100;
// Total images found in flickr
let totalImages = 0;
// New images actually inserted into the database
let imagesInserted = 0;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;

exports.handler = async event => {
  const query = event.queryStringParameters;
  const client = new MongoClient(uri);
  const brandObj = await fetchBrands();

  let page = 1;
  // We are only fetching images for one brand at a time!
  const response = await addFlickrPhotosToMongoDB(client, page, brandObj);
  console.log('My response: ', response);

  return {
    headers: {
      "Access-Control-Allow-Origin": "*"
    },
    statusCode: 200,
    body: JSON.stringify({ totalImages, imagesInserted, status: response.status })
  }
};

async function addFlickrPhotosToMongoDB(client, page, brandObj) {
  console.log(`Starting API call to Flickr page ${page}`);
  // get unix date for 1 month ago
  const unixDate = Math.floor(Date.now() / 1000) - (60 * 60 * 24 * 30);
  try {
    const flickrResponse = await flickr.photos.search({
      user_id: '25964651@N03',
      min_upload_date: unixDate,
      extras: 'date_upload, o_dims, url_o',
      per_page: flickrPerPage,
      page: page
    });
    if (flickrResponse.errors !== undefined && flickrResponse.errors.length) throw new Error(response.errors);
    // console.log(flickrResponse.body);
    totalImages = flickrResponse.body.photos.total;
    const maxPages = flickrResponse.body.photos.pages;
    console.log('Total images found in Flickr: ' + totalImages);
    console.log('Total pages: ' + maxPages);
    const imagesReturned = flickrResponse.body.photos.photo;
    
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
        delete doc.owner;
        return doc;
    })
    // Insert our images into the DB
    const dbResponse = await insertManyImages(client, imagesToInsert);
    console.log(`Done page ${page}`);
    console.log('dbResponse: ', dbResponse);
    imagesInserted += dbResponse.inserted;
    
    // check to see if we need to fetch more images
    if(page < maxPages) {
      // all we still have more pages to check in Flickr
      console.log('running again');
      return await addFlickrPhotosToMongoDB(client, page+1, brandObj);
    } else {
      // we've done the final page
      console.log(`All pages done, finishing up.`)
      return { page: page, status: 'complete' }
    } 

  } catch(error) {
    console.error('Error in addFlickrPhotosToMongoDB:', error);
    return { status: 'error', error: error.message };
  }
    
}


const insertManyImages = async (client, newImages) => {
  let returnObject = {
    inserted: 0,
    status: "started",
  };
  try {
    await client.connect();
    const result = await client.db("image_bank").collection("images").insertMany(newImages, { ordered: false });
    console.log(result);
    console.log('mongo result insertedCount: ', result.insertedCount);
    //if no error, all images were inserted successfully
    returnObject.inserted = result.insertedCount;
    returnObject.status = "success";
  } catch(e) {
    console.log('Write Error: ' + e.code);
    if(e.code === 11000) console.log('Expected duplicate ID error');
    if(e.result?.nInserted < newImages.length) {
      //some images weren't inserted - likely duplicates, stop fetching images
      const {writeErrors, insertedIds, ...logObj} = e.result.result;
      console.log(logObj)
      returnObject.inserted = e.result.nInserted;
      returnObject.status = `success: ${e.code}`
    } else {
      console.log(e.result)
      returnObject.status = `error: ${e.code}`;
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
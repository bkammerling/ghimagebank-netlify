const {MongoClient} = require('mongodb');
const Flickr = require('flickr-sdk');
const admin = require("firebase-admin");
const { stream } = require("@netlify/functions");

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
let totalImages;
// New images actually inserted into the database
let imagesInserted = 0;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;

export default handler = async () => {
  const encoder = new TextEncoder();
  const client = new MongoClient(uri);
  const brandObj = await fetchBrands();

  let page = 1;

  const body = new ReadableStream({
    async start(controller) {
      try {
        // Send initial message    
        controller.enqueue(encoder.encode("data: Looking for images in Flickr...\n\n"));
        
        // Wait for Flickr function
        await addFlickrPhotosToMongoDB(client, page, brandObj, controller, encoder);
        console.log('Now Finished adding images to MongoDB');
        // Send a final update
        controller.enqueue(encoder.encode(`data: Finished inserting ${imagesInserted} images into the database out of ${totalImages} new images.`));
      }
      catch (error) {
        console.error('Error in stream:', error);
        controller.enqueue(encoder.encode(
          `event: error\n` +
          `data: ${error.message}`
        ));
      } finally {
        controller.enqueue(encoder.encode(`data: complete`));
        controller.close();

      }
    }
  })

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream", // For Server-Sent Events
      "Access-Control-Allow-Origin": "*",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    }
  });

}

async function addFlickrPhotosToMongoDB(client, page, brandObj, controller, encoder) {
  console.log(`Starting API call to Flickr page ${page}`);
  // get unix date for 1 week ago
  const unixDate = Math.floor(Date.now() / 1000) - (60 * 60 * 24 * 7);
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
    if(!totalImages) {
      totalImages = flickrResponse.body.photos.total;
      console.log('Total images found in Flickr: ' + totalImages);
      controller.enqueue(encoder.encode(`data: Found ${totalImages} images uploaded to Flickr in the last 7 days.\n\n`));
    }
    const maxPages = flickrResponse.body.photos.pages;
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
    controller.enqueue(encoder.encode(`data: Fetching page ${page} from Flickr...\n\n`));
    // Insert our images into the DB
    const dbResponse = await insertManyImages(client, imagesToInsert);
    console.log(`Done page ${page}`);
    console.log('dbResponse: ', dbResponse);
    imagesInserted += dbResponse.inserted;
    controller.enqueue(encoder.encode(`data: Inserted ${imagesInserted} into DB from Flickr...\n\n`));
    if(dbResponse.status.indexOf('11000') !== -1) {
      // we have duplicates, so stop fetching images
      controller.enqueue(encoder.encode(`data: Images already in DB...\n\n`));
    }
    
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
    controller.enqueue(encoder.encode(`Encountered a problem with the sync...\n\n`));
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
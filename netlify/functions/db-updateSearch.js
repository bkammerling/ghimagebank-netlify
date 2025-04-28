const {MongoClient} = require('mongodb');
const Flickr = require('flickr-sdk');

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
// Total images fully matching search and regex
let totalMatched = 0;
// New images actually inserted into the database
let imagesInserted = 0;
// Search query for flickr - careful this doesn't bring up other brands' images
const search = 'JE';
const brand = 'jewson';
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;

exports.handler = async event => {
  const query = event.queryStringParameters;
  const client = new MongoClient(uri);
  let page = 1;
  
  // We are only fetching images for one brand at a time!
  const response = await addFlickrPhotosToMongoDB(client, page);
  console.log('My response: ', response);

  return {
    headers: {
      "Access-Control-Allow-Origin": "*"
    },
    statusCode: 200,
    body: JSON.stringify({ totalImages, imagesMatched, imagesInserted, status: response.status })
  }
};

async function addFlickrPhotosToMongoDB(client, page) {
  console.log(`Starting API call to Flickr page ${page}`);
  try {
    const flickrResponse = await flickr.photos.search({
      user_id: '25964651@N03',
      text: search,
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
    
    // Create regex to test the titles against our search label (e.g. JE00)
    const regex = new RegExp(`^${search}\\d{2}`); 

    // Filter out images that don't match our search label and clean the data
    const imagesToInsert = imagesReturned
      .filter(doc => doc.title && regex.test(doc.title))
      .map(doc => {
        doc._id = doc.id;
        doc.dateupload = parseInt(doc.dateupload);
        doc.lastModified = new Date();
        doc.dateInserted = new Date();
        doc.brand = brand;  
        delete doc.isfriend;
        delete doc.isprimary;
        delete doc.ispublic;
        delete doc.isfamily;
        delete doc.owner;
        return doc;
      })
    totalMatched += imagesToInsert.length;
    // Insert out filtered images into the DB
    const dbResponse = await insertManyImages(client, imagesToInsert);
    console.log(`Done page ${page}`);
    console.log('dbResponse: ', dbResponse);
    imagesInserted += dbResponse.inserted;
    
    // check to see if we need to fetch more images
    if(page < maxPages) {
      // all we still have more pages to check in Flickr
      console.log('running again');
      return await addFlickrPhotosToMongoDB(client, page+1);
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
      console.log('logObj: ' + logObj)
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

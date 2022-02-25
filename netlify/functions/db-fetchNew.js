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
const oauth = new Flickr.OAuth(
  process.env.FLICKR_API_KEY,
  process.env.FLICKR_API_SECRET
);
const flickrPerPage = 100;
const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@gh-imagebank.axxa1.mongodb.net/image_bank?retryWrites=true&w=majority`;

exports.handler = async event => {
  const query = event.queryStringParameters;
  const client = new MongoClient(uri);
  let page = 1;
  const maxImages = await getImageCount();
  const maxPages = Math.ceil(maxImages / flickrPerPage);
  const response = await addFlickrPhotosToMongoDB(client, maxPages);
  console.log(response);
  const imagesInserted = ((maxPages - response.page) * flickrPerPage) + response.lastPageInsertedCount;
  return {
    headers: {
      "Access-Control-Allow-Origin": "*"
    },
    statusCode: 200,
    body: JSON.stringify({ imagesInserted, status: response.status })
  }
};

async function addFlickrPhotosToMongoDB(client, page) {
  console.log(`Starting API call to Flickr page ${page}`);
  const flickrResponse = await flickr.photosets.getPhotos({
    photoset_id: '72157685205779916',
    user_id: '25964651@N03',
    extras: 'date_upload, o_dims, url_o',
    per_page: flickrPerPage,
    page: page
  });
  if (flickrResponse.errors !== undefined && flickrResponse.errors.length) throw new Error(response.errors);
  const imagesReturned = flickrResponse.body.photoset.photo;
  const imagesToInsert = imagesReturned.map(doc => {
    doc._id = doc.id;
    doc.lastModified = new Date();
    doc.dateInserted = new Date();
    delete doc.isfriend;
    delete doc.isprimary;
    delete doc.ispublic;
    delete doc.isfamily;
    return doc;
  })
  const dbResponse = await insertManyImages(client, imagesToInsert);
  console.log(`Done page ${page}`);
  // check to see if we need to fetch more images
  // we won't go under page 580 as that suggests an error (total 589 pages at time of coding)
  if(dbResponse.inserted === imagesReturned.length && page-1 > 580) {
    addFlickrPhotosToMongoDB(page-1);
  } else if(dbResponse.inserted < imagesReturned.length) {
    return { lastPageInsertedCount: dbResponse.inserted, page, status: dbResponse.status }
  }
}

const getImageCount = async () => {
  const response = await flickr.photosets.getInfo({
    photoset_id: '72157685205779916',
    user_id: '25964651@N03',
  });
  if (response.errors !== undefined && response.errors.length) throw new Error(response.errors);
  return response.body.photoset.count_photos;
}


const insertManyImages = async (client, newImages) => {
  let returnObject = {
    inserted: 0,
    status: null,
  };
  try {
    await client.connect();
    const result = await client.db("image_bank").collection("images").insertMany(newImages, { ordered: false });
    console.log(result);
    //if no error, all images were inserted successfully
    returnObject.inserted = result.insertedCount;
    returnObject.status = "success";
  } catch(e) {
    console.log('Write Error: ' + e.code);
    if(e.code === 11000) console.log('Expected duplicate ID error');
    if(e.result?.nInserted < newImages.length) {
      //some images weren't inserted - likely duplicates, stop fetching images
      returnObject.inserted = e.result.nInserted;
      returnObject.status = `success: ${e.code}`
    } else {
      returnObject.status = `error: ${e.code}`;
    }
  }
  return returnObject;
}

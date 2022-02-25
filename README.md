![Netlify examples](netlify-badge-examples.png)

# Hello world functions

**View a demo site**: https://example-hello-world-function.netlify.app/

[![Netlify Status](https://api.netlify.com/api/v1/badges/f15f03f9-55d8-4adc-97d5-f6e085141610/deploy-status)](https://app.netlify.com/sites/example-hello-world-function/deploys)



## About this site

This site is running serverless functions with Netlify Functions. 

- [About Netlify Functions](https://www.netlify.com/products/functions/?utm_campaign=dx-examples&utm_source=example-site&utm_medium=web&utm_content=example-hello-functions)
- [Docs: Netlify Functions](https://docs.netlify.com/functions/overview/?utm_campaign=dx-examples&utm_source=example-site&utm_medium=web&utm_content=example-hello-functions)
- [Accessing your function logs](https://docs.netlify.com/functions/logs/?utm_campaign=dx-examples&utm_source=example-site&utm_medium=web&utm_content=example-hello-functions)
- [Learn serverless in the functions playground](https://functions.netlify.com/?utm_campaign=dx-examples&utm_source=example-site&utm_medium=web&utm_content=example-hello-functions)
            
            
## Install and run this example locally

You can clone this example repo to explore its features and implementation, and to run it locally.

```shell

# 1. Clone the repository to your local development environment
git clone ...

# 2. Move into the project directory
cd ...

# 3. Install the Netlify CLI to let you locally serve your site using Netlify's features
npm install -g netlify-cli

# 4. Serve your site using Netlify Dev to get local serverless functions
netlify dev

```


## MongoDB Shell help

```shell

  mongosh "mongodb+srv://YOUR_MONGO_URL" --apiVersion 1 --username USER

  # Find with $regex example
  db.images.find({ title: { $regex: '(RE0021-Reign-Non-Ambassador-4SKU-250ml-).*'})

  # Prepare big collection to edit ID field with $exists - SPEEDY WAY
  var docArray = db.images.find({ 'lastModified': { $exists: false} });
  
  var insertArray = docArray.map(doc => { 
    doc._id = doc.id;
    doc.lastModified = new Date();
    doc.dateInserted = new Date();
    delete doc.isfriend;
    delete doc.isprimary;
    delete doc.ispublic;
    delete doc.isfamily;
  })
  db.images.insertMany(insertArray);

  # Then if you want to remove the old documents
  var docArray = db.images.find({ 'lastModified': { $exists: false} });
  db.images.deleteMany(docArray);

  # Find and loop with $exists example - VERY SLOW WAY
  db.images.find({ 'lastModified': { $exists: false} }).forEach(doc => {
    const newDoc = { ...doc, _id: doc.id, lastModified: new Date(), dateInserted: new Date() }
    delete newDoc.isfriend
    delete newDoc.isprimary
    delete newDoc.ispublic
    delete newDoc.isfamily
    db.images.insertOne(newDoc)
    db.images.deleteOne({ "_id": doc._id })
  });

```

## MongoDB Backup with mongodump

```shell

 mongodump --uri=mongodb+srv://URI -u="USER" -p="PASSWORD" --authenticationDatabase="admin" --out="dump-$(date +%d)"

 ```
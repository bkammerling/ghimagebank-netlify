/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('image_bank');

const filter = {
  $and: [
    { brand: { $exists: true } },
    { title: { $regex: '^JE.*'}}
  ]
}

//{ title: { $regex: '^MU\\d\\d\\d.*'}}

// Search for documents in the current collection.
console.log(db.getCollection('images').find(filter).count());
// log the first 10 documents with this filter
db.getCollection('images').find(filter).limit(10).forEach(printjson);

//db.getCollection('images').find(filter);

//db.getCollection('images').updateMany(filter, { $set: { brand: "monsterstrat" }});

//monsterstrat
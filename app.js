
var r = require("rethinkdb");
var express = require("express");
var bluebird = require("bluebird");
var config = require("./config");

var app = express();
app.use(express.static(__dirname + "/public"));

var feedUrl = "earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

// Fetch data from the USGS earthquake feed and transform all
// the locations into point objects. Insert the data into the
// `quakes` table. This query is assigned to a variable so it
// can easily be reused in two different parts of the program.
refresh =
  r.table("quakes").insert(
    r.http(feedUrl)("features").merge(function(item) {
      return {
        geometry: r.point(
          item("geometry")("coordinates")(1),
          item("geometry")("coordinates")(0))
      }
    }), {conflict: "replace"});

// Perform initial setup, creating the database and table
// It also creates a geospatial index on the `geometry` proeprty
// and performs the query above in order to populate the data
r.connect(config.database).then(function(conn) {
  this.conn = conn;
  return r.dbCreate(config.database.db).run(conn);
}).then(function(output) {
  return r.tableCreate("quakes").run(this.conn);
}).then(function(output) {
  return r.table("quakes").indexCreate(
    "geometry", {geo: true}).run(conn);
}).then(function(output) { 
  return refresh.run(conn);
}).error(function(err) {
  if (err.msg.indexOf("already exists") == -1)
    console.log(err);
}).finally(function(output) {
  if (this.conn)
    this.conn.close();
});

// Use the refresh query above to automatically update the the
// earthquake database with new data at 30 minute intervals and
// delete the records that are older than 30 days
setInterval(function() {
  r.connect(config.database).then(function(conn) {
    this.conn = conn;

    return bluebird.join(refresh.run(conn),
      r.table("quakes")
        .filter(r.epochTime(r.row("properties")("time").div(1000)).lt(
         r.now().sub(60 * 60 * 24 * 30))).delete().run(conn));
  })
  .error(function(err) {
    console.log("Failed to refresh:", err);
  })
  .finally(function(output) {
    if (this.conn)
      this.conn.close();
  });
}, 30 * 1000 * 60);

// Define the `/quakes` endpoint for the backend API. It queries
// the database and retrieves the earthquakes ordered by magnitude
// and then returns the output as a JSON array
app.get("/quakes", function(req, res) {
  r.connect(config.database).then(function(conn) {
    this.conn = conn;

    return r.table("quakes").orderBy(
      r.desc(r.row("properties")("mag"))).run(conn);
  })
  .then(function(cursor) { return cursor.toArray(); })
  .then(function(result) { res.json(result); })
  .error(function(err) {
    console.log("Error handling /quakes request:", err);
    res.status(500).json({success: false, err: err});
  })
  .finally(function() {
    if (this.conn)
      this.conn.close();
  });
});

// Define the `/nearest` endpoint for the backend API. It takes
// two URL query parameters, representing the latitude and longitude
// of a point. It will query the `quakes` table to find the closest
// earthquake, which is returned as a JSON object
app.get("/nearest", function(req, res) {
  var latitude = req.param("latitude");
  var longitude = req.param("longitude");

  if (!latitude || !longitude)
    return res.json({err: "Invalid Point"});

  r.connect(config.database).then(function(conn) {
    this.conn = conn;

    return r.table("quakes").getNearest(
      r.point(parseFloat(latitude), parseFloat(longitude)),
      { index: "geometry", unit: "mi" }).run(conn);
  })
  .then(function(result) { res.json(result); })
  .error(function(err) {
    console.log("Error handling /nearest request:", err);
    res.status(500).json({success: false, err: err});
  })
  .finally(function(result) {
    if (this.conn)
      this.conn.close();
  });
});

app.listen(8090);
console.log("Server started on port 8090");

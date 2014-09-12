
var r = require("rethinkdb");
var express = require("express");
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
r.connect(config.database, function(err, conn) {
  r.dbCreate(config.database.db).run(conn, function(err, output) {
    if (err) return conn.close();
    r.tableCreate("quakes").run(conn, function(err, output) {
      r.table("quakes").indexCreate("geometry", {geo: true}).run(conn);
      refresh.run(conn).then(function(result) { conn.close(); });
    });
  });
});

// Use the refresh query above to automatically update the the
// earthquake database with new data at 30 minute intervals
setInterval(function() {
  r.connect(config.database, function(err, conn) {
    console.log("Refreshing...");
    refresh.run(conn).then(function (err, out) {
      r.table("quakes")
        .filter(r.epochTime(r.row("properties")("time").mul(0.001)).lt(
            r.now().sub(60 * 60 * 24 * 30)))
        .delete().run(conn);
    });
  });
}, 30 * 1000 * 60);

// Define the `/quakes` endpoint for the backend API. It queries
// the database and retrieves the earthquakes ordered by magnitude
// and then returns the output as a JSON array
app.get("/quakes", function(req, res) {
  r.connect(config.database, function(err, conn) {
    r.table("quakes")
      .orderBy(r.desc(r.row("properties")("mag"))).run(conn)
      .then(function(cursor) { return cursor.toArray(); })
      .then(function(result) {
        res.json(result);
        conn.close();
      });
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

  r.connect(config.database, function(err, conn) {
    r.table("quakes")
      .getNearest(r.point(+latitude, +longitude), {
        index: "geometry", unit: "mi"
      }).run(conn).then(function(result) {
        res.json(result);
        conn.close();
      });
  });
});

app.listen(8090);
console.log("Server started on port 8090");

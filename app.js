
var r = require("rethinkdb");
var express = require("express");
var config = require("./config");

var app = express();
app.use(express.static(__dirname + "/public"));

var feedUrl = "http://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

// Fetch data from the USGS earthquake feed and transform all
// the locations into point objects. Insert the data into the
// `quakes` table. This query is assigned to a variable so it
// can easily be reused in two different parts of the program.
refresh =
  r.table("quakes").insert(
    r.http(feedUrl)("features").map(function(item) {
      return {
        id: item("id"),
        properties: item("properties"),
        place: r.point(
          item("geometry")("coordinates")(1),
          item("geometry")("coordinates")(0))
      }
    }));

// Perform initial setup, creating the database and table
// It also creates a geospatial index on the `place` proeprty
// and performs the query above in order to populate the data
r.connect(config.database, function(err, conn) {
  r.dbCreate(config.database.db).run(conn, function(err, output) {
    if (err) return conn.close();
    r.tableCreate("quakes").run(conn, function(err, output) {
      r.table("quakes").indexCreate("place", {geo: true}).run(conn);
      refresh.run(conn).then(function(result) { conn.close(); });
    });
  });
});

// Define the `/refresh` endpoint for the backend API, which will
// delete the existing contents of the `quakes` table and then
// repopulate it by performing the `refresh` query defined above
app.get("/refresh", function(req, res) {
  r.connect(config.database, function(err, conn) {
    r.table("quakes").delete().run(conn).then(function(err) {
      refresh.run(conn)
        .error(function(err) { res.json({err: err}); })
        .then(function(result) { res.json({success: true}); })
        .done(function() { conn.close(); });
    });
  });
});

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
        index: "place", unit: "mi"
      }).run(conn).then(function(result) {
        res.json(result);
        conn.close();
      });
  });
});

app.listen(8090);
console.log("Server started on port 8090");

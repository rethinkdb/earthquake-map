## RethinkDB Earthquake Map

This application uses [data from the USGS](http://earthquake.usgs.gov/earthquakes/feed/v1.0/) to display earthquakes detected over the last 30 days. The earthquakes are displayed in a list view and an interactive map. The backend is written with node.js and [RethinkDB](http://rethinkdb.com/), taking advantage of the new GeoJSON functionality introduced in RethinkDB 1.15. The frontend is built with AngularJS and the Leaflet mapping library, with map tiles provided by [OpenStreetMap project](http://www.openstreetmap.org/).

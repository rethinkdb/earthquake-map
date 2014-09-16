
var app = angular.module("quakes", []);

app.controller("MainController", [
  "$rootScope", "$scope", "$http",
  function($rootScope, $scope, $http) {
    
    // When the user's location changes, remove any existing user
    // markers and create a new one at the user's coordinates
    $scope.$watch("userLocation", function(newVal, oldVal) {
      if (!newVal) return;
      
      if ($scope.userMarker)
        $scope.map.removeLayer($scope.userMarker);

      var point = L.latLng(newVal.latitude, newVal.longitude);
      $scope.userMarker = L.marker(point, {
        icon: L.icon({iconUrl: "mark.png"})
      });

      $scope.map.addLayer($scope.userMarker);
    });
    
    // When earthquakes are added or removed from the filtered array
    // Add or remove the corresponding markers so that the map is
    // consistent with the earthquake list
    $scope.$watchCollection("filteredQuakes", function(addItems, removeItems) {
      if (removeItems && removeItems.length)
        for (var i in removeItems)
          $scope.map.removeLayer(removeItems[i].marker);

      if (addItems && addItems.length)
        for (var i in addItems)
          $scope.map.addLayer(addItems[i].marker);
    });

    // When this custom filter is applied to the quake array, it will
    // will include only the earthquakes that occurred on the day that
    // the user specifies in the date control
    $scope.isSameDay = function(item) {
      if (!$scope.date) return true;

      var date = new Date(item.properties.time);
      var targetDate = new Date($scope.date + " ");
      
      return date.getYear() == targetDate.getYear() &&
             date.getMonth() == targetDate.getMonth() &&
             date.getDate() == targetDate.getDate();
    };

    // This function uses the browser geolocation APIs to fetch the user's
    // location. The coordinates are passed to the backend's `/nearest`
    // endpoint as URL query parameters. The `/nearest` endpoint returns
    // the closest earthquake and its distance, which are assigned to
    // variables within the current scope
    $scope.updateUserLocation = function() {
      navigator.geolocation.getCurrentPosition(function(position) {
        $scope.userLocation = position.coords;

        $http.get("/nearest", {params: position.coords})
          .success(function(output) {
            if (!output.length) return;
            $scope.nearest = output[0].doc.id;
            $scope.nearestDistance = output[0].dist;
          }).error(function(err) {
            console.log("Failed to retrieve nearest quake:", err);
          });
      });
    };

    // This function fetches the list of earthquakes from the backend's
    // `/quakes` endpoint. After fetching the quakes, it extracts the
    // coordinates and creates a place marker which is stored in a
    // property of the quake object. The actual place markers are applied
    // in the `$watchCollection` statement above
    $scope.fetchQuakes = function() {
      $http.get("/quakes").success(function(quakes) {
        for (var i in quakes) {
          quakes[i].point = L.latLng(
            quakes[i].geometry.coordinates[1],
            quakes[i].geometry.coordinates[0]);

          quakes[i].marker = L.circleMarker(quakes[i].point, {
            radius: quakes[i].properties.mag * 2,
            fillColor: "#616161", color: "#616161"
          });
        }

        $scope.quakes = quakes;
      }).error(function(err) {
        console.log("Failed to retrieve quakes:", err);
      });
    };

    // This function is called when the user clicks on an earthquake
    // in the earthquake list. It assigns the selected earthquake to
    // the `selectedQuake` variable in the current scope and then
    // adjusts the map to bring the quake into focus.
    $scope.selectQuake = function(quake) {
      $scope.selectedQuake = quake;
      $scope.map.setView(quake.point, 5, {animate: true});
    };

    // Instantiate the map and configure the tile layer
    // The map uses tiles provided by the OpenStreetMap project
    $scope.map = L.map("map").setView([0, 0], 2);
    $scope.map.addLayer(L.tileLayer(
      "http://{s}.tile.osm.org/{z}/{x}/{y}.png",
      {attribution: "<a href=\"http://osm.org/copyright\">OpenStreetMap</a>"}
    ));

    $scope.fetchQuakes();
    $scope.updateUserLocation();
  }
]);

window.setTimeout(function() {
  location.reload();
}, 1000 * 60 * 3);

function Vehicle(vehicle, included, map) {
  this.id_ = vehicle.id;
  this.route_ = included.find(data => data.id == vehicle.relationships.route.data.id);

  this.setMap(map);

  this.stop_ = null;
  this.div_ = null;
  this.marker_ = new google.maps.Marker({
    map: map
  });

  this.update(vehicle, included);
}

function InfoBox() {
  this.vehicles = {};
  this.setMap(null);
}

function Bound(sw, ne, map) {
  this.sw = new google.maps.LatLng(sw);
  this.ne = new google.maps.LatLng(ne);
  this.markers = {
    sw: new google.maps.Marker({ map: map, position: this.sw, optimized: false, opacity: 0}),
    ne: new google.maps.Marker({ map: map, position: this.ne, optimized: false, opacity: 0})
  }
  this.div_ = document.createElement("div");
  this.div_.classList.add("bound");
  this.setMap(map);
}

function shapes_url() {
  return ENV.V3_API_URL + "/shapes?filter[route]=" + shape_route() + "&include=stops&api_key=" + ENV.MBTA_API_KEY + get_date_filter();
}

function vehicles_url() {
  return ENV.V3_API_URL + "/vehicles?filter[route]=" + vehicle_route() + "&include=route,stop&api_key=" + ENV.MBTA_API_KEY + get_date_filter();
}

function shape_route() {
  return "Shuttle005";
}

function vehicle_route() {
  // return "Shuttle000"
  // return "202,210,222"
  return "Red";
}

function schedules_url() {
  const now = new Date();
  let hour = now.getHours() + 1;
  let minute = now.getMinutes() + 1;
  hour = hour < 10 ? ("0" + hour) : hour;
  minute = minute < 10 ? ("0" + minute) : minute;
  return ENV.V3_API_URL + "/schedules?filter[route]=" + shape_route() +
                              "&filter[min_time]=" + hour + minute +
                              "&filter[max_time]=" + hour + minute +
                              "&api_key=" + ENV.MBTA_API_KEY +
                              get_date_filter();
}

function get_date_filter() {
  return "&filter[date]=2018-01-08"
}

function promise_request(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.onload = () => resolve(xhr.responseText);
    xhr.onerror = () => reject(xhr.statusText);
    xhr.send();
  });
}

function draw_shape(shape, map, included, stop_hash) {
  const polyline = decode_polyline(shape.attributes.polyline)
                      .map(points => ({lat: points[0], lng: points[1]}) );
  return {
    shape:  new google.maps.Polyline({
      path: polyline,
      icons: [{
        icon: {
          path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
          strokeColor: "#000000",
          strokeOpacity: 0.5,
          scale: 1.8
        },
        repeat: "3%",
      }],
      strokeColor: "#000000",
      strokeOpacity: 0.5,
      map: map
    }),
    stops: shape.relationships.stops.data.forEach(draw_stop(map, included, stop_hash))
  }
}

function adjust_map_bounds(shape_hash, map) {
  try {
    const ne = Object.keys(shape_hash).reduce(find_shape_point(shape_hash, is_northeast_point), map.getCenter().toJSON())
    const sw = Object.keys(shape_hash).reduce(find_shape_point(shape_hash, is_southwest_point), map.getCenter().toJSON())
    const center = {
      lat: ne.lat - ((ne.lat - sw.lat) / 2),
      lng: ne.lng - ((ne.lng - sw.lng) / 2)
    }
    map.setCenter(center)
    const bounds = new Bound(sw, ne, map)
    if (bounds.is_visible()) {
      // console.log("full shape is visible");
    } else {
      // console.log("shape is not fully visible");
    }
    // do_adjust_map_bounds(bounds, map);
  } catch (error) {
    console.error("error caught in adjust_map_bounds", error);
  }
}

function do_adjust_map_bounds(bounds, map) {
  // map.panToBounds(bounds)
  const path = [
    bounds.sw.toJSON(),
    {
      lat: bounds.sw.lat(),
      lng: bounds.ne.lng()
    },
    bounds.ne.toJSON(),
    {
      lat: bounds.ne.lat(),
      lng: bounds.sw.lng()
    },
    bounds.sw.toJSON()
  ];
  new google.maps.Polyline({
    path: path,
    strokeColor: "#ff0000",
    map: map
  });
  // map.fitBounds(map.getBounds().extend(bounds.getSouthWest()).extend(bounds.getNorthEast()));
  const overlay = new google.maps.OverlayView({map: map});
  const ne = new google.maps.Marker({
    map: map
  });
  // map.setCenter(bounds.getCenter().toJSON());
  // [0, 1, 2, 3, 4].forEach(i => map.fitBounds(new_bounds));
  //map.fitBounds(bounds);
  // console.log("center", map.getProjection().fromLatLngToPoint(map.getCenter()));
  // console.log("ne", map.getProjection().fromLatLngToPoint(ne));
  // console.log("sw", map.getProjection().fromLatLngToPoint(sw));
  // if (!map.getBounds().equals(new_bounds)) {
  //   map.setZoom(map.getZoom() - 1);
  //   do_adjust_map_bounds(sw, ne, map)
  // }
}

function find_shape_point(shape_hash, reducer) {
  return function(last_point, key) {
    return shape_hash[key].shape.getPath().getArray()
      .map(point => point.toJSON())
      .reduce(reducer, last_point);
  }
}

function is_southwest_point(last_point, point) {
  return {
    lat: point.lat < last_point.lat ? point.lat : last_point.lat,
    lng: point.lng < last_point.lng ? point.lng : last_point.lng
  };
}

function is_northeast_point(last_point, point) {
  return {
    lat: point.lat > last_point.lat ? point.lat : last_point.lat,
    lng: point.lng > last_point.lng ? point.lng : last_point.lng
  }
}

function draw_stop(map, included, stop_hash) {
  return function do_draw_stop(stop_data) {
    if (!stop_hash[stop_data.id]) {
      const stop = included.find(included_stop => { return included_stop.id == stop_data.id });
      stop_hash[stop_data.id] = new google.maps.Marker({
        position: {
          lat: stop.attributes.latitude,
          lng: stop.attributes.longitude
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          labelOrigin: label_origin(stop.id),
          scale: 5
        },
        label: {
          text: stop.attributes.name,
          fontWeight: "bold"
        },
        draggable: false,
        map: map,
        zIndex: 1000,
        id: stop.id
      });
    }
  }
}

function label_origin(id) {
  switch (id) {
    case "place-nqncy":
      return {x: -10, y: 0}
      break;
    case "place-qnctr":
      return {x: 10, y: 0}
      break;
    case "place-qamnl":
      return {x: 12, y: 0}
      break;
    case "place-brntn":
      return {x: -9, y: 0}
      break;
    case "3025":
      return {x: 20, y: 0}
      break;
    case "3038":
      return {x: 15, y: 0}
      break;
    case "3052":
      return {x: 17, y: 0}
      break;
    case "9170099":
      return {x: -17, y: 0}
      break;
    case "9070099":
      return {x: -31, y: -3}
      break;
    case "9170100":
      return {x: -25, y: 0}
      break;
    case "9070100":
      return {x: 32, y: 2}
      break;
    case "9070101":
      return {x: -20, y: 3}
      break;
    case "9270099":
      return {x: 25, y: 0}
      break;
    default:
      return {x: 10, y: 0}
      break;
  }
}


function add_shape(shape_hash, map, included, stop_hash) {
  return function do_add_shape(new_shape) {
    if (!shape_hash[new_shape.id]) {
      shape_hash[new_shape.id] = draw_shape(new_shape, map, included, stop_hash);
    }
  }
}

function load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash) {
    Promise.all([promise_request(vehicles_url()), promise_request(shapes_url())])
      .then(do_load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash))
      .catch(error => console.log("Promise error caught in load_map_data: ", error));
}

function do_load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash) {
  return function(data) {
    try {
      const new_vehicles = JSON.parse(data[0]);
      const new_shapes = JSON.parse(data[1]);
      if (new_shapes && new_shapes.data) {
        new_shapes.data.slice(0).forEach(add_shape(shape_hash, map, new_shapes.included, stop_hash));
      } else {
        console.error("unexpected result for new_shapes", new_shapes);
      }

      adjust_map_bounds(shape_hash, map);

      if (new_vehicles && new_vehicles.data) {
        Object.keys(vehicle_hash).forEach(update_vehicle_hash(vehicle_hash, new_vehicles));
        new_vehicles.data.forEach(add_new_vehicle(vehicle_hash, map, (new_vehicles.included || []).slice(0)))
      } else if (new_vehicles && new_vehicles.data != []) {
        console.error("unexpected result for new_vehicles", new_vehicles);
      }

      info_box.setMap(map);
      info_box.update(vehicle_hash, stop_hash);

      window.setTimeout(function(){ load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash) }, 1000);
    } catch (error) {
      console.error("caught error in do_load_map_data/4: ", error);
    }
  }
}

function update_vehicle_hash(vehicle_hash, new_vehicles) {
  return id => {
    const new_data = new_vehicles.data.find(vehicle => vehicle.id == id);
    if (new_data && vehicle_hash[id]) {
      vehicle_hash[id].update(new_data, (new_vehicles.included || []).slice(0))
    } else if (vehicle_hash[id]) {
      vehicle_hash[id].setMap(null);
      vehicle_hash[id] = null;
    }
  }
}

function add_new_vehicle(vehicle_hash, map, included) {
  return new_vehicle => {
    if (!vehicle_hash[new_vehicle.id]) {
      vehicle_hash[new_vehicle.id] = new Vehicle(new_vehicle, included, map)
    }
  }
}

function init_map() {
  console.log("last page load", new Date());
  console.log("shape route:", shape_route());
  console.log("vehicle routes:", vehicle_route());

  Vehicle.prototype = new google.maps.OverlayView();
  InfoBox.prototype = new google.maps.OverlayView();
  Bound.prototype = new google.maps.OverlayView();

  Bound.prototype.onAdd = function() {
    // -------   @impl google.maps.OverlayView
  }

  Bound.prototype.onRemove = function() {
    this.div_.parentNode.removeChild(this.div_);
    this.div_ = null
  }

  Bound.prototype.draw = function() {
    if (this.getPanes()) {
      // console.log(this.getPanes().markerLayer)
      Array.from(this.getPanes().overlayLayer.getElementsByClassName("bound"))
        .forEach(marker => marker.parentNode.removeChild(marker));
      this.getPanes().overlayLayer.appendChild(this.div_);
    }
  }

  Bound.prototype.is_visible = function() {
    if (this.getPanes()) {
      const rects = this.getPanes().overlayLayer.getElementsByClassName("bound")[0].getBoundingClientRect();
      // console.log("bound rects", rects)
      return rects.top > 0 && rects.left > 0;
    } else {
      return false;
    }
  }


  Vehicle.prototype.onAdd = function() {
    const div = document.createElement("div");
    div.id = this.id_
    div.classList.add("vehicle");

    const label_div = document.createElement("div");
    label_div.classList.add("vehicle__label");

    div.appendChild(label_div);

    this.divs_ = {
      container: div,
      label: label_div
    }

    const panes = this.getPanes();
    panes.markerLayer.appendChild(div);
  }

  Vehicle.prototype.draw = function() {
    this.update_marker();
    if (this.divs_) {
      this.divs_.label.textContent = this.label_text();
      const overlayProjection = this.getProjection();
      if (overlayProjection) {
        const loc = overlayProjection.fromLatLngToDivPixel(this.get_position());
        this.divs_.container.style.left = loc.x + "px";
        this.divs_.container.style.top = loc.y + "px";
      }
    }
  };

  Vehicle.prototype.onRemove = function() {
    this.divs_.container.parentElement.removeChild(this.divs_.container);
    this.marker_.setMap(null);
    this.marker_ = null;
    return false;
  }

  Vehicle.prototype.icon_opts = function() {
    return {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      strokeColor: this.get_color(),
      scale: 5,
      rotation: this.attributes_.bearing
    }
  }

  Vehicle.prototype.get_color = function() {
    if (this.route_ && this.route_.id) {
      switch (this.route_.id) {
        default:
          return "#FF0000";
      }
    }
  }

  Vehicle.prototype.get_position = function() {
    return new google.maps.LatLng(this.attributes_.latitude, this.attributes_.longitude);
  }

  Vehicle.prototype.update_stop = function(stops) {
    if (this.relationships_.stop && this.relationships_.stop.data) {
      this.stop_ = stops.find(data => data.id == this.relationships_.stop.data.id);
    }
  }

  Vehicle.prototype.update_marker = function() {
    this.marker_.setPosition(this.get_position());
    this.marker_.setIcon(this.icon_opts());
  }

  Vehicle.prototype.update = function(new_data, stops) {
    this.attributes_ = new_data.attributes;
    this.relationships_ = new_data.relationships;

    this.update_stop(stops);

    this.draw();
  }

  Vehicle.prototype.label_text = function() {
    if (this.route_) {
      return ["Shuttle", this.attributes_.label,
              "(" + this.route_.attributes.short_name,
              this.route_.attributes.direction_names[this.attributes_.direction_id] + ")",
              // "Vehicle",
              // this.attributes_.label,
              this.attributes_.current_status.toLowerCase().split("_").join(" "),
              this.stop_.attributes.name].join(" ");
    } else if (this.stop_) {
      return ["Vehicle", this.attributes_.label, this.attributes_.current_status.toLowerCase().split("_").join(" "), this.stop_.attributes.name].join(" ");
    } else {
      return ["Vehicle", this.attributes_.label].join(" ");
    }
  }

  InfoBox.prototype.onAdd = function() {
    if (this.div_) {
      this.div_.classList.remove(".info-box--hidden");
    } else {
      this.div_ = document.createElement("div");
      this.div_.id = "info-box";
      this.div_.classList.add("info-box");

      this.div_.appendChild(document.createElement("h1"));
      this.div_.appendChild(document.createElement("div"));

      this.div_.children[0].classList.add("info-box__header");
      this.div_.children[1].classList.add("info-box__vehicles");

      this.div_.children[0].textContent = "Active Shuttles";

      document.getElementById("map").appendChild(this.div_);
    }
  }

  InfoBox.prototype.onRemove = function() {
    if (this.div_) {
      this.div_.classList.add("info-box--hidden");
    }
  }

  InfoBox.prototype.update = function(vehicles, _stops) {
    this.vehicles_ = vehicles;
    this.draw();
  }

  InfoBox.prototype.draw = function(map) {
    try {
      const vehicle_keys = Object.keys(this.vehicles_);
      if (vehicle_keys.length > 0 && this.div_) {
        Array.from(this.div_.querySelector(".info-box__vehicles").children)
            .forEach(child => child.parentNode.removeChild(child));
        vehicle_keys.forEach(this.add_vehicle_info.bind(this));
      } else if (this.div_) {
        this.setMap(null);
      }
    } catch (error) {
      console.error("caught error in InfoBox.draw:", error)
    }
  }

  InfoBox.prototype.add_vehicle_info = function(key) {
    try {
      const vehicle_div = document.createElement("div");
      vehicle_div.classList.add("info-box__vehicle");

      vehicle_div.appendChild(document.createElement("span"));
      vehicle_div.children[0].classList.add("info-box__vehicle-name");
      vehicle_div.children[0].textContent = this.vehicle_name(key);

      vehicle_div.appendChild(document.createElement("span"));
      vehicle_div.children[1].classList.add("info-box__vehicle-status");
      vehicle_div.children[1].textContent = this.vehicle_status(key);

      this.div_.querySelector(".info-box__vehicles").appendChild(vehicle_div);
    } catch (error) {
      console.error("caught error in InfoBox.add_vehicle_info:", error);
    }
  }

  InfoBox.prototype.vehicle_name = function(key) {
    if (this.vehicles_[key] && this.vehicles_[key].attributes_) {
      return ["Shuttle", this.vehicles_[key].attributes_.label].join(" ");
    } else if (this.vehicles_[key]) {
      return ["Shuttle", this.vehicles_[key].id].join(" ");
    } else {
      return "Shuttle"
    }
  }

  InfoBox.prototype.vehicle_status = function(key) {
    if (this.vehicles_[key] && this.vehicles_[key].attributes_ && this.vehicles_[key].stop_) {
      return [this.vehicles_[key].attributes_.current_status.toLowerCase().split("_").join(" "),
              this.vehicles_[key].stop_.attributes.name].join(" ");

    } else {
      return "status not available";
    }
  }

  const map_opts = {
    zoom: 15,
    center: {lat: 42.266671, lng: -71.017924},
    // center: {lat: 42.0, lng: -71.0},
    mapTypeControl: false,
    streetViewControl: false,
    styles: [{
      featureType: 'poi',
      stylers: [{visibility: 'off'}]
    }, {
      featureType: 'administrative',
      stylers: [{visibility: 'off'}]
    }]
  }

  load_map_data(new google.maps.Map(document.getElementById('map'), map_opts), new InfoBox(), {}, {}, {});
}

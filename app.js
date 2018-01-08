let shape_ids = [];

if (location.search.includes("refresh=true")) {
  window.setTimeout(function() {
    location.reload();
  }, 1000 * 60 * 10);
}

if (!location.search.includes("hide_header")) {
  const h1 = document.createElement("h1");
  h1.classList.add("page-title");
  h1.textContent = "Wollaston Shuttle: Current Vehicle Locations";
  document.body.appendChild(h1);
}

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

function Shape(shape, map, included) {
  this.id_ = shape.id;
  this.attributes_ = shape.attributes;
  this.route_id_ = shape.relationships.route.data.id;
  this.stop_ids_ = shape.relationships.stops.data.slice(0).map(stop => stop.id);
  this.relationships_ = shape.relationships
  this.path_ = decode_polyline(shape.attributes.polyline)
                      .map(points => new google.maps.LatLng(points[0], points[1]));
  this.setMap(map);
  this.polyline_ = new google.maps.Polyline({
    path: this.path_,
    strokeColor: "#000000",
    strokeOpacity: 0.5,
  });
}

function shapes_url() {
  return ENV.V3_API_URL + "/shapes?filter[route]=" + shape_route() + "&include=stops&api_key=" + ENV.MBTA_API_KEY + get_date_filter();
}

function vehicles_url() {
  return ENV.V3_API_URL + "/vehicles?filter[route]=" + vehicle_route() + "&include=route,stop&api_key=" + ENV.MBTA_API_KEY + get_date_filter();
}

function shape_route() {
  // return "Shuttle005,Shuttle000";
  return vehicle_route();
}

function vehicle_route() {
  return "Shuttle002,Shuttle005";
  // return "Shuttle005,Shuttle000"
  // return "202,210,222"
}

function schedules_url() {
  const now = new Date();
  let hour = now.getHours() + 1;
  let minute = now.getMinutes() + 1;
  hour = hour < 10 ? ("0" + hour) : hour;
  min_minute = minute < 10 ? ("0" + minute) : minute;
  max_minute = (minute + 5) < 10 ? ("0" + (minute + 5)) : minute + 5;
  return ENV.V3_API_URL + "/schedules?filter[route]=" + shape_route() +
                              "&filter[min_time]=" + hour + ":" + min_minute +
                              "&filter[max_time]=" + hour + ":" + max_minute +
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

function adjust_map_bounds(shape_hash, map) {
  try {
    const ne = Object.keys(shape_hash).reduce(find_shape_point(shape_hash, is_northeast_point), map.getCenter().toJSON())
    const sw = Object.keys(shape_hash).reduce(find_shape_point(shape_hash, is_southwest_point), map.getCenter().toJSON())
    const center = {
      lat: ne.lat - ((ne.lat - sw.lat) / 2),
      lng: ne.lng - ((ne.lng - sw.lng) / 2)
    }
    const bounds = new google.maps.LatLngBounds(sw, ne)
    map.setCenter(center);
    map.fitBounds(bounds);
  } catch (error) {
    console.warn("error caught in adjust_map_bounds", error);
  }
}

function find_shape_point(shape_hash, reducer) {
  return function(last_point, key) {
    return shape_hash[key].polyline_.getPath().getArray()
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
    const stop = included.find(included_stop => { return included_stop.id == stop_data.id });
    if (!stop_hash[stop_data.id] && should_render_marker(stop)) {
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

function should_render_marker(stop) {
  if (stop.attributes.name.includes("Shuttle") && shape_ids.includes("Shuttle005")) {
    return false;
  } else {
    return true;
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
      return {x: 17, y: -5}
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


function add_shape(map, included, stop_hash) {
  return function do_add_shape(shape_hash, new_shape) {
    if (!shape_hash[new_shape.id] && shape_ids.includes(new_shape.relationships.route.data.id)) {
      shape_hash[new_shape.id] = new Shape(new_shape, map, included);
    }
    return shape_hash;
  }
}

function load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash) {
    return Promise.all([promise_request(vehicles_url()), promise_request(shapes_url())])
                  .then(do_load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash))
                  .catch(error => console.warn("Promise error caught in load_map_data: ", error));
}

function do_load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash) {
  const old_keys = Object.keys(shape_hash).slice(0).sort();
  return function(data) {
    try {
      const new_vehicles = JSON.parse(data[0]);
      const new_shapes = JSON.parse(data[1]);
      if (location.search.includes("log=true")) {
        console.log("vehicle data", new_vehicles);
        console.log("shape data", new_shapes);
      }
      if (new_shapes && new_shapes.data) {
        shape_ids = new_vehicles.data.slice(0).reduce((acc, vehicle) => {
          if (!acc.includes(vehicle.relationships.route.id)) {
            acc.push(vehicle.relationships.route.data.id);
          }
          return acc;
        }, []);
        if (shape_ids.length == 0) {
          shape_ids = ["Shuttle005"];
        }
        new_shapes.data.slice(0).reduce(add_shape(map, new_shapes.included, stop_hash), shape_hash);
      } else {
        console.warn("unexpected result for new_shapes", new_shapes);
      }

      if (new_vehicles && new_vehicles.data) {
        Object.keys(vehicle_hash).forEach(update_vehicle_hash(vehicle_hash, new_vehicles));
        new_vehicles.data.forEach(add_new_vehicle(vehicle_hash, map, (new_vehicles.included || []).slice(0)))
      } else if (new_vehicles && new_vehicles.data != []) {
        console.warn("unexpected result for new_vehicles", new_vehicles);
      }

      info_box.setMap(map);
      info_box.update(vehicle_hash, stop_hash);

      const is_same = Object.keys(shape_hash)
                            .slice(0)
                            .sort()
                            .reduce((acc, key, i) => { return key == old_keys[i] }, true)
      if (is_same == false) {
        adjust_map_bounds(shape_hash, map);
      }

      window.setTimeout(function(){ load_map_data(map, info_box, shape_hash, vehicle_hash, stop_hash) }, 3000);
    } catch (error) {
      console.warn("caught error in do_load_map_data/4: ", error);
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
      delete vehicle_hash[id];
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
  Shape.prototype = new google.maps.OverlayView();

  Shape.prototype.onAdd = function() {
    // -------   @impl google.maps.OverlayView
  }

  Shape.prototype.onRemove = function() {
    this.polyline_.setMap(null);
  }

  Shape.prototype.draw = function() {
    if (shape_ids.includes(this.route_id_)) {
      this.polyline_.setMap(this.getMap());
    } else {
      this.polyline_.setMap(null);
    }
  }

  Bound.prototype.onAdd = function() {
    // -------   @impl google.maps.OverlayView
  }

  Bound.prototype.onRemove = function() {
    this.div_.parentNode.removeChild(this.div_);
    this.div_ = null
  }

  Bound.prototype.draw = function() {
    if (this.getPanes()) {
      Array.from(this.getPanes().overlayLayer.getElementsByClassName("bound"))
        .forEach(marker => marker.parentNode.removeChild(marker));
      this.getPanes().overlayLayer.appendChild(this.div_);
    }
  }

  Vehicle.prototype.onAdd = function() {
    const div = document.createElement("div");
    div.id = this.id_
    div.classList.add("vehicle");

    const label_div = document.createElement("div");
    label_div.classList.add("vehicle__label");

    if (location.search.includes("show_info=true")) {
      div.appendChild(label_div);
    }

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
    return [this.route_name(), this.name()].join(" ");
  }

  Vehicle.prototype.name = function() {
    return ["Vehicle", this.attributes_.label || "(id not available)"].join(" ");
  }

  Vehicle.prototype.route_name = function() {
    if (this.route_) {
      return this.route_.attributes.long_name;
    } else {
      return "(route not available)";
    }
  }

  Vehicle.prototype.status = function() {
    return this.attributes_.current_status
               .toLowerCase()
               .split("_")
               .filter(string => string != "to" && string != "at")
               .join(" ")
  }

  InfoBox.prototype.onAdd = function() {
    if (this.show()) {
      if (this.div_) {
        this.div_.classList.remove(".info-box--hidden");
      } else {
        this.div_ = document.createElement("div");
        this.div_.id = "info-box";
        this.div_.classList.add("info-box");

        this.div_.appendChild(document.createElement("h1"));
        this.div_.children[0].classList.add("info-box__header");
        this.div_.children[0].textContent = "Vehicles";

        this.div_.appendChild(document.createElement("div"));
        this.div_.children[1].textContent = ["Route:", vehicle_route()].join(" ");

        this.div_.appendChild(document.createElement("div"));
        this.div_.children[2].textContent = ["API:", ENV.V3_API_URL].join(" ");

        this.div_.appendChild(document.createElement("div"));
        this.div_.children[3].classList.add("info-box__vehicles");

        document.getElementById("map").appendChild(this.div_);
      }
    }
  }

  InfoBox.prototype.onRemove = function() {
    if (this.div_) {
      this.div_.classList.add("info-box--hidden");
    }
  }

  InfoBox.prototype.update = function(vehicles, _stops) {
    if (this.show()) {
      this.vehicles_ = vehicles;
      this.draw();
    }
  }

  InfoBox.prototype.show = function() {
    return location.search.includes("show_info=true")
  }

  InfoBox.prototype.draw = function(map) {
    if (this.show()) {
      try {
        const vehicle_keys = Object.keys(this.vehicles_);
        if (this.div_) {
          Array.from(this.div_.querySelector(".info-box__vehicles").children)
              .forEach(child => child.parentNode.removeChild(child));
        }
        if (vehicle_keys.length > 0 && this.div_) {
          vehicle_keys.forEach(this.add_vehicle_info.bind(this));
        } else if (this.div_) {
          const p = document.createElement("p");
          p.classList.add("info-box__no-vehicles");
          p.textContent = "No vehicles on map";
          this.div_.querySelector(".info-box__vehicles").appendChild(p);
        }
      } catch (error) {
        console.warn("caught error in InfoBox.draw:", error)
      }
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
      vehicle_div.children[1].classList.add("info-box__vehicle-location");
      vehicle_div.children[1].textContent = this.vehicle_location(key);

      vehicle_div.appendChild(document.createElement("span"));
      vehicle_div.children[2].classList.add("info-box__vehicle-status");
      vehicle_div.children[2].textContent = this.vehicle_status(key);

      this.div_.querySelector(".info-box__vehicles").appendChild(vehicle_div);
    } catch (error) {
      console.warn("caught error in InfoBox.add_vehicle_info:", error);
    }
  }

  InfoBox.prototype.vehicle_name = function(key) {
    if (this.vehicles_[key] && this.vehicles_[key].attributes_) {
      return ["Vehicle", this.vehicles_[key].attributes_.label].join(" ");
    } else if (this.vehicles_[key]) {
      return ["Vehicle", this.vehicles_[key].id].join(" ");
    } else {
      return "Vehicle"
    }
  }

  InfoBox.prototype.vehicle_location = function(key) {
    if (this.vehicles_[key]) {
      return [this.vehicles_[key].attributes_.latitude, this.vehicles_[key].attributes_.longitude].join(" ");
    } else {
      return "location not available"
    }
  }

  InfoBox.prototype.vehicle_status = function(key) {
    const status = this.vehicles_[key] &&
                   this.vehicles_[key].attributes_ &&
                   this.vehicles_[key].attributes_.current_status ? this.vehicles_[key].attributes_.current_status.toLowerCase().split("_").join(" ") : "(status not available)"
    const stop = this.vehicles_[key] &&
                 this.vehicles_[key].stop_ ? this.vehicles_[key].stop_.attributes.name : "(stop not available)";
   return [status, stop].join(" ");
  }

  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 14,
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
  });
  load_map_data(map, new InfoBox(), {}, {}, {})
}

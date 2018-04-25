let shape_ids = [];
window.shape_hash = {};
window.stop_hash = {};
window.vehicle_hash = {};
window.included = [];

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

function Vehicle(vehicle, i, included, map) {
  this.id_ = vehicle.id;
  this.route_ = included.find(data => data.id == vehicle.relationships.route.data.id);

  this.stop_ = null;
  this.div_ = null;
  this.marker_ = new google.maps.Marker({map: map});
  this.setMap(map);

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
  this.stop_ids_.forEach(draw_stop(included, map));
  this.relationships_ = shape.relationships
  this.path_ = decode_polyline(shape.attributes.polyline)
                      .map(points => new google.maps.LatLng(points[0], points[1]));
  this.setMap(map);
  this.polyline_ = new google.maps.Polyline({});
  this.polyline_.setOptions(this.polyline_opts());
}

function Stop(stop, map) {
  this.setMap(map);
  this.id_ = stop.id;
  this.attributes_ = stop.attributes
  this.position_ = new google.maps.LatLng(stop.attributes.latitude, stop.attributes.longitude);
  this.marker_ = new google.maps.Marker({
    map: map,
    position: this.position_,
    draggable: false,
    clickable: false,
    zIndex: 1000,
    label: this.label_opts(),
    icon: this.icon_opts()
  });
}

function shapes_url() {
  return ENV.V3_API_URL + "/shapes?include=stops&filter[route]=" + shape_route() + "&api_key=" + ENV.MBTA_API_KEY;
}

function vehicles_url() {
  return ENV.V3_API_URL + "/vehicles?filter[route]=" + vehicle_route() + "&include=route&fields[vehicle]=label,name,latitude,longitude&api_key=" + ENV.MBTA_API_KEY;
}

function vehicle_route() {
  return "Shuttle002,Shuttle005";
}

function shape_route() {
  return vehicle_route();
}

function schedules_url() {
  const now = new Date();
  const five_mins = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                             now.getHours(), now.getMinutes() + 5, now.getSeconds(), now.getMilliseconds());
  return ENV.V3_API_URL + "/schedules?filter[route]=" + vehicle_route() +
                              "&filter[min_time]=" + get_time(now) +
                              "&filter[max_time]=" + get_time(five_mins) +
                              get_date_filter();
}

function get_time(date) {
  return date.toLocaleTimeString("UTC", {hour12: false})
             .split(":")
             .slice(0,2)
             .join(":")
}

function get_date_filter() {
  const now = new Date();
   return "&filter[date]=" + [now.toLocaleDateString("UTC", {year: "numeric"}),
                              now.toLocaleDateString("UTC", {month: "2-digit"}),
                              now.toLocaleDateString("UTC", {day: "2-digit"})].join("-");
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

function draw_stop(included, map) {
  return function do_draw_stop(stop_id) {
    const stop = included.find(included_stop => { return included_stop.id == stop_id });
    if (!stop_hash[stop_id] && should_render_marker(stop)) {
      stop_hash[stop_id] = new Stop(stop, map);
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

function add_shape(map, included) {
  return function do_add_shape(new_shape) {
    if (!shape_hash[new_shape.id] && shape_ids.includes(new_shape.relationships.route.data.id)) {
      shape_hash[new_shape.id] = new Shape(new_shape, map, included);
    }
    return shape_hash;
  }
}

function load_map_data(map) {
    return Promise.all([promise_request(shapes_url()), promise_request(schedules_url())])
                  .then(do_load_map_data(map))
                  .catch(error => console.warn("Promise error caught in load_map_data: ", error));
}

function do_load_map_data(map, info_box) {
  const old_keys = Object.keys(shape_hash).slice(0).sort();
  return function(data) {
    try {
      const new_shapes = JSON.parse(data[0]);
      const new_schedules = JSON.parse(data[1]);
      if (location.search.includes("log=true")) {
        console.log("shape data", new_shapes);
        console.log("schedule data", new_schedules);
        console.log("shape ids", shape_ids);
      }
      if (new_shapes && new_shapes.data && new_schedules && new_schedules.data) {
        update_shape_ids(new_schedules);
        new_shapes.data.slice(0).forEach(add_shape(map, new_shapes.included));
      } else {
        console.warn("unexpected result for new_shapes", new_shapes);
      }
      const is_same = Object.keys(shape_hash)
                            .slice(0)
                            .sort()
                            .reduce((acc, key, i) => { return key == old_keys[i] }, true)
      if (is_same == false) {
        adjust_map_bounds(shape_hash, map);
      }

      window.setTimeout(function(){ load_map_data(map) }, 3600000);
    } catch (error) {
      console.warn("caught error in do_load_map_data/4: ", error);
    }
  }
}

function connect_to_vehicles(map, info_box) {
  const es = new EventSource(vehicles_url());
  es.addEventListener("reset", function(ev) {
    window.included = [];
    for (var vehicle_id in vehicle_hash) {
      vehicle_hash[vehicle_id].setMap(null);
    }
    vehicle_hash = {};
    JSON.parse(ev.data).forEach(function(data) {
      if (data.type == "vehicle") {
        add_new_vehicle(vehicle_hash, map, window.included)(data, 0);
      } else {
        window.included.push(data);
      }
    });
  });
  es.addEventListener("add", function(ev) {
    const data = JSON.parse(ev.data);
    if (data.type == "vehicle") {
      add_new_vehicle(vehicle_hash, map, window.included)(data, 0);
    } else {
      window.included.push(data);
    }
  });
  es.addEventListener("update", function(ev) {
    const data = JSON.parse(ev.data);
    if (data.type == "vehicle") {
      vehicle_hash[data.id].update(data, []);
    }
  });
  es.addEventListener("remove", function(ev) {
    const data = JSON.parse(ev.data);
    if (data.type == "vehicle") {
      vehicle_hash[data.id].setMap(null);
      delete vehicle_hash[data.id];
    }
  });
}

function update_shape_ids(new_schedules) {
  shape_ids = new_schedules.data.slice(0).reduce((acc, schedule) => {
    if (!acc.includes(schedule.relationships.route.data.id)) {
      acc.push(schedule.relationships.route.data.id);
    }
    return acc;
  }, []);
  if (shape_ids.length == 0) {
    shape_ids = ["Shuttle005"];
  }
}

function update_vehicle_hash(new_vehicles) {
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
  return (new_vehicle, i) => {
    if (!vehicle_hash[new_vehicle.id]) {
      vehicle_hash[new_vehicle.id] = new Vehicle(new_vehicle, i, included, map)
    }
  }
}

function init_map() {
  console.log("last page load", new Date());
  console.log("vehicle routes:", vehicle_route());

  Vehicle.prototype = new google.maps.OverlayView();
  InfoBox.prototype = new google.maps.OverlayView();
  Bound.prototype = new google.maps.OverlayView();
  Shape.prototype = new google.maps.OverlayView();
  Stop.prototype = new google.maps.OverlayView();

  Shape.prototype.onAdd = function() {
    // -------   @impl google.maps.OverlayView
  }

  Shape.prototype.onRemove = function() {
    this.polyline_.setMap(null);
  }

  Shape.prototype.draw = function() {
    if (shape_ids.includes(this.route_id_)) {
      this.polyline_.setOptions(this.polyline_opts());
      this.polyline_.setMap(this.getMap());
      this.stop_ids_.forEach(stop_id => stop_hash[stop_id] && stop_hash[stop_id].setMap(this.getMap()));
    } else {
      this.polyline_.setMap(null);
    }
  }

  Shape.prototype.polyline_opts = function() {
    return {
      path: this.path_,
      strokeColor: "#000000",
      strokeOpacity: 0.5,
      icons: [{
        icon: {
          path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
          strokeColor: "#000000",
          strokeOpacity: 0.5,
          scale: this.arrow_scale()
        },
        repeat: this.arrow_repeat()
      }]
    }
  }

  Shape.prototype.arrow_scale = function() {
    switch (this.getMap().getZoom()) {
      case 18:
      case 17:
        return 3.0;
        break;
      case 16:
        return 2.5;
        break;
      case 15:
        return 2.0;
        break;
      default:
        return 1.5;
    }
  }

  Shape.prototype.arrow_repeat = function() {
    switch (this.getMap().getZoom()) {
      case 18:
      case 17:
        return "3%";
        break;
      case 16:
        return "5%";
      case 15:
        return "7%";
      case 14:
        return "10%";
        break;
      case 13:
        return "12%";
      default:
        return "0%";
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

    if (location.search.includes("show_label=true")) {
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
    if (this.divs_) {
      this.divs_.container.parentElement.removeChild(this.divs_.container);
    }
    this.marker_.setMap(null);
    this.marker_ = null;
    return false;
  }

  Vehicle.prototype.icon_opts = function() {
    return {
      url: "bus-icon.svg"
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

    this.draw();
  }

  Vehicle.prototype.label_text = function() {
    return this.attributes_.label;
  }

  Vehicle.prototype.status = function() {
    return this.attributes_.current_status
               .toLowerCase()
               .split("_")
               .filter(string => string != "to" && string != "at")
               .join(" ")
  }

  Stop.prototype.onAdd = function() {
  }

  Stop.prototype.onRemove = function() {
    this.marker_.setMap(null);
    return false;
  }

  Stop.prototype.draw = function() {
  }

  Stop.prototype.label_offset = function() {
    switch (this.id_) {
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

  Stop.prototype.icon_opts = function() {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6,
      strokeWeight: 1.5,
      fillColor: "white",
      fillOpacity: 1,
      labelOrigin: this.label_offset()
    }
  }

  Stop.prototype.label_opts = function() {
    return {
      text: this.label_text(),
      fontWeight: "bold",
      fontSize: this.font_size()
    }
  }

  Stop.prototype.label_text = function() {
    if (window.innerWidth > 544) {
      return this.attributes_.name;
    } else {
      return " ";
    }
  }

  Stop.prototype.font_size = function() {
    return "14px";
  }

  Stop.prototype.label_origin = function() {
    switch (this.id_) {
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
        this.div_.children[3].textContent = ["Vehicles query:", vehicles_url()].join(" ");

        this.div_.appendChild(document.createElement("div"));
        this.div_.children[4].textContent = ["Shapes query:", shapes_url()].join(" ");

        this.div_.appendChild(document.createElement("div"));
        this.div_.children[5].textContent = ["Schedules query:", schedules_url()].join(" ");

        this.div_.appendChild(document.createElement("div"));
        this.div_.children[6].classList.add("info-box__vehicles");

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

      this.div_.querySelector(".info-box__vehicles").appendChild(vehicle_div);
    } catch (error) {
      console.warn("caught error in InfoBox.add_vehicle_info:", error);
    }
  }

  InfoBox.prototype.vehicle_name = function(key) {
    if (this.vehicles_[key] && this.vehicles_[key].attributes_) {
      return this.vehicles_[key].name();
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
  const info_box = new InfoBox();
  info_box.setMap(map);
  load_map_data(map);
  connect_to_vehicles(map, info_box);
}

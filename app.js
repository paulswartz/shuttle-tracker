var api_url = "https://dev.api.mbtace.com";

const routes = "Shuttle005"

function shapes_url() {
  return api_url + "/shapes?filter[route]=" + routes + "&include=route,stops&api_key=" + MBTA_API_KEY + get_date_filter();
}

function vehicles_url() {
  return api_url + "/vehicles?filter[route]=" + "Red" + "&include=trip,stop&api_key=" + MBTA_API_KEY + get_date_filter();
}

function schedules_url() {
  const now = new Date();
  let hour = now.getHours() + 1;
  let minute = now.getMinutes() + 1;
  hour = hour < 10 ? ("0" + hour) : hour;
  minute = minute < 10 ? ("0" + minute) : minute;
  return api_url + "/schedules?filter[route]=" + routes +
                              "&filter[min_time]=" + hour + minute +
                              "&filter[max_time]=" + hour + minute +
                              "&include=route,stop" +
                              "&api_key=" + MBTA_API_KEY +
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
                      .map(points => { return {lat: points[0], lng: points[1]} });
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

function draw_vehicle(vehicle, map, included) {
  return new google.maps.Marker({
    position: {
      lat: vehicle.attributes.latitude,
      lng: vehicle.attributes.longitude
    },
    title: vehicle_title(vehicle, find_vehicle_stop(vehicle, included)),
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      strokeColor: vehicle_color(vehicle.relationships.route.data.id),
      scale: 5,
      rotation: vehicle.attributes.bearing
    },
    draggable: false,
    map: map
  });
}

function draw_stop(map, included, stop_hash) {
  return function do_draw_stop(stop_data) {
    if (!stop_hash[stop_data.id]) {
      const stop = included.find(included_stop => { return included_stop.id == stop_data.id });
      const marker = new google.maps.Marker({
        position: {
          lat: stop.attributes.latitude,
          lng: stop.attributes.longitude
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          labelOrigin: label_origin(stop),
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
      const info = new google.maps.InfoWindow({
        content: stop.attributes.name
      })
      marker.addListener("click", () => { info.open(map, marker); });
      stop_hash[stop_data.id] = {
        marker: marker,
        label: info
      }
    }
  }
}

function label_origin(stop) {
  console.log(stop.id, stop.attributes.name)
  switch (stop.id) {
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
      return {x: -20, y: 0}
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
  }
}

function find_vehicle_stop(vehicle, stops) {
  return stops.find(data => data.id == vehicle.relationships.stop.data.id);
}

function vehicle_title(vehicle, stop) {
  return ["Vehicle",
          vehicle.attributes.label,
          vehicle.attributes.current_status.toLowerCase().split("_").join(" "),
          stop.attributes.name].join(" ");
}

function vehicle_color(route_id) {
  return "#FF0000";
//  switch (route_id) {
//    case "Red":
//      return "#FF0000";
//      break;
//    case "Orange":
//      return "orange";
//      break;
//    case "Blue":
//      return "blue";
//      break;
//    case "Green-B":
//    case "Green-C":
//    case "Green-D":
//    case "Green-E":
//      return "green";
//      break;
//    case "CR-Fitchburg":
//    case "CR-Lowell":
//    case "CR-Haverhill":
//    case "CR-Middleborough":
//      return "purple";
//      break;
//    default:
//      return "yellow";
//      break;
//  }
}

function add_shape(shape_hash, map, included, stop_hash) {
  return function do_add_shape(new_shape) {
    if (!shape_hash[new_shape.id]) {
      shape_hash[new_shape.id] = draw_shape(new_shape, map, included, stop_hash);
    }
  }
}

function load_map_data(map, shape_hash, vehicle_hash, stop_hash) {
  Promise.all([promise_request(vehicles_url()),
               promise_request(schedules_url()),
               promise_request(shapes_url())]).then(data => {
    const new_vehicles = JSON.parse(data[0]);
    const schedules = JSON.parse(data[1]);
    const new_shapes = JSON.parse(data[2]);
    console.log(schedules);
    new_shapes.data.slice(0).forEach(add_shape(shape_hash, map, new_shapes.included, stop_hash));
    Object.keys(vehicle_hash).forEach(update_vehicle_hash(vehicle_hash, new_vehicles));
    new_vehicles.data.forEach(add_new_vehicle(vehicle_hash, map, new_vehicles.included.slice(0)))

    window.setTimeout(function(){ load_map_data(map, shape_hash, vehicle_hash, stop_hash) }, 3000);
  })
}

function update_vehicle_hash(vehicle_hash, new_vehicles) {
  return id => {
    const new_data = new_vehicles.data.find(vehicle => vehicle.id == id);
    if (new_data) {
      vehicle_hash[id].setPosition({
        lat: new_data.attributes.latitude,
        lng: new_data.attributes.longitude
      })
      vehicle_hash[id].setIcon({
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        strokeColor: vehicle_color(new_data.relationships.route.data.id),
        scale: 5,
        rotation: new_data.attributes.bearing
      });
      const stop = find_vehicle_stop(new_data, new_vehicles.included)
      vehicle_hash[id].setTitle(vehicle_title(new_data, stop))
    } else {
      vehicle_hash[id].setMap(null);
      delete vehicle_hash[id];
    }
  }
}

function add_new_vehicle(vehicle_hash, map, included) {
  return new_vehicle => {
    if (!vehicle_hash[new_vehicle.id]) {
      vehicle_hash[new_vehicle.id] = draw_vehicle(new_vehicle, map, included)
    }
  }
}

function init_map() {
  const beale_at_library = {lat: 42.266671, lng: -71.017924}
  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 15,
    center: beale_at_library,
    styles: [{
      featureType: 'poi',
      stylers: [{visibility: 'off'}]
    }, {
      featureType: 'administrative',
      stylers: [{visibility: 'off'}]
    }]
  });
  window.vehicle_map = map;
  load_map_data(map, {}, {}, {});
}

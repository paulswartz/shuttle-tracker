var api_url = "https://dev.api.mbtace.com";

function shuttle_route_url() {
  return api_url + "/routes?filter%5Bstop%5D=place-nqncy,place-qnctr" + get_date_filter();
}

function shapes_url() {
  return api_url + "/shapes?filter%5Broute%5D=Red&include=route,stops" + get_date_filter();
}

function vehicles_url() {
  return api_url + "/vehicles?filter%5Broute%5D=Red&include=trip,stop" + get_date_filter();
}

function get_date_filter() {
  var date = new Date();
  // return "&filter%5Bdate%5D="+ "2018" +"-"+ "01" +"-"+ "08" + "&api_key=" + MBTA_API_KEY;
  return "&filter%5Bdate%5D="+ date.getFullYear() +"-"+ (date.getMonth() + 1) +"-"+ date.getDate() + "&api_key=" + MBTA_API_KEY;
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

function is_shuttle_shape(shape) { return true; }

function is_shuttle_vehicle(stop_ids) {
  return function do_is_shuttle_vehicle(vehicle) {
    return true
  }
}

function draw_shape(map, included) {
  return function do_draw_shape(shape, i) {
    const color = i == 0 ? "#FF0000" : "#000000";
    const polyline = decode_polyline(shape.attributes.polyline)
                       .map(points => { return {lat: points[0], lng: points[1]} });
    new google.maps.Polyline({
      path: polyline,
      strokeColor: color,
      strokeOpacity: 0.1,
      map: map
    });
    shape.relationships.stops.data.map(draw_stop(map, included, color));
  }
}

function draw_vehicle(map, included) {
  return function do_draw_vehicle(vehicle, i) {
    const stop = included.find(data => data.id == vehicle.relationships.stop.data.id);
    const vehicle_title = ["Vehicle",
                           vehicle.attributes.label,
                           vehicle.attributes.current_status.toLowerCase().split("_").join(" "),
                           stop.attributes.name].join(" ");
    const color = stop.attributes.name.split(" - ").pop() == "Outbound" ? "#FF0000" : "#000000";
    new google.maps.Marker({
      position: {
        lat: vehicle.attributes.latitude,
        lng: vehicle.attributes.longitude
      },
      title: vehicle_title,
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        strokeColor: "#FF0000",
        scale: 3,
        rotation: vehicle.attributes.bearing
      },
      draggable: false,
      map: map
    });
  }
}

function draw_stop(map, included, color) {
  return function do_draw_stop(stop_data) {
    const stop = included.find(included_stop => { return included_stop.id == stop_data.id });
    return new google.maps.Marker({
      position: {
        lat: stop.attributes.latitude,
        lng: stop.attributes.longitude
      },
      title: stop.attributes.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        strokeColor: color,
        scale: 3
      },
      draggable: false,
      map: map,
      id: stop.id
    });
  }
}

function init_map() {
  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 13,
    center: {lat: 42.241241, lng: -71.005297}
  });
  window.vehicle_map = map;
  Promise.all([promise_request(shapes_url()), promise_request(vehicles_url())]).then(data => {
    const json = data.map(str => JSON.parse(str));
    console.log("json", json);
    const all_shapes = json[0];
    const vehicles = json[1];
    const trips = vehicles.included.slice(0).filter(item => item.type == "trip");
    const shapes = {};
    trips.forEach(trip => {
      shapes[trip.relationships.shape.data.id] = shapes[trip.relationships.shape.data.id] || all_shapes.data.find(shape => shape.id == trip.relationships.shape.data.id)
    });
    Object.values(shapes).forEach(draw_shape(map, all_shapes.included.slice(0)));
    vehicles.data.forEach(draw_vehicle(map, vehicles.included.slice(0)));
  })
}

var setting;
var sections = [];
var markerElm;
window.electronAPI.messageSend((event, request) => {
  if (request.action == "setting") {
    document.getElementById("splash").style.display = "none";

    setting = request.data.config;
    document.getElementById("softVersion").innerText = request.data.softVersion;

    document.getElementById("latitude").value = setting.home.latitude;
    document.getElementById("longitude").value = setting.home.longitude;
    document.getElementById("EEW_Voice").value = setting.notice.voice.EEW;
    document.getElementById("EQInfo_ItemCount").value = setting.Info.EQInfo.ItemCount;
    document.getElementById("RealTimeShake_ItemCount").value = setting.Info.RealTimeShake.List.ItemCount;

    var SaibunElm = Array.from(document.querySelectorAll("#saibun option")).find(function (elm) {
      return elm.innerText == setting.home.Section;
    });
    if (SaibunElm) SaibunElm.selected = true;

    document.getElementById("BugReportAutoSend").checked = setting.system.crashReportAutoSend;
    init();
  } else if (request.action == "Update_Data") {
    UpdateDataDraw(request.data);
  }
});

var updateWrap = document.getElementById("update-wrap");
var updateStatus = document.getElementById("update-status");
var updateVersion = document.getElementById("update-version");
var downloadLink = document.getElementById("downloadLink");
var update_detail = document.getElementById("update-detail");
function UpdateDataDraw(data) {
  document.getElementById("update-check-date").innerText = dateEncode(3, data.check_date);
  updateWrap.classList.remove("U-error", "U-available", "U-not_available");
  downloadLink.style.display = "none";
  update_detail.style.display = "none";

  if (data.check_error) {
    updateWrap.classList.add("U-error");
    updateStatus.innerText = "更新の確認中にエラーが発生しました。";
    updateVersion.innerText = "---";
  } else {
    if (data.update_available) {
      updateWrap.classList.add("U-available");
      updateStatus.innerText = "更新が利用可能です。";
      downloadLink.setAttribute("href", data.dl_page);
      updateVersion.innerText = "ver." + data.current_version + " > ver." + data.latest_version;
      update_detail.innerText = "更新内容：" + data.update_detail.replace(/\r?\n/g, "");
      downloadLink.style.display = "block";
      update_detail.style.display = "inline";
    } else {
      updateWrap.classList.add("U-not_available");
      updateStatus.innerText = "お使いのアプリケーションは最新の状態です。";
      updateVersion.innerText = "ver." + data.current_version;
    }
  }
}

document.getElementById("check_update").addEventListener("click", function () {
  updateStatus.innerText = "更新を確認中...";
  window.electronAPI.messageReturn({
    action: "checkForUpdate",
  });
});

document.getElementById("apply").addEventListener("click", function () {
  setting.system.crashReportAutoSend = document.getElementById("BugReportAutoSend").checked;
  setting.home.latitude = document.getElementById("latitude").value;
  setting.home.longitude = document.getElementById("longitude").value;
  setting.home.Section = document.getElementById("saibun").value;
  setting.notice.voice.EEW = document.getElementById("EEW_Voice").value;
  setting.Info.EQInfo.ItemCount = Number(document.getElementById("EQInfo_ItemCount").value);
  setting.Info.RealTimeShake.List.ItemCount = Number(document.getElementById("RealTimeShake_ItemCount").value);
  window.electronAPI.messageReturn({
    action: "settingReturn",
    data: setting,
  });
  window.close();
});

document.getElementById("cancel").addEventListener("click", function () {
  window.close();
});

function init() {
  map = L.map("mapcontainer", {
    maxBounds: [
      [90, 0],
      [-90, 360],
    ],

    zoomAnimation: true, //←オフにするとずれて不自然
    //preferCanvas: true,←かるくなる？
  });
  //L.control.scale({ imperial: false }).addTo(map);←縮尺

  map.setView([32.99125, 138.46], 4);
  map.createPane("jsonMAPPane").style.zIndex = 210;
  var jsonMAPCanvas = L.canvas({
    pane: "jsonMAPPane",
  });

  map.createPane("pane300").style.zIndex = 300;
  var homeIcon = L.icon({
    iconUrl: "img/homePin.svg",
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });

  markerElm = L.marker([setting.home.latitude, setting.home.longitude], {
    keyboard: false,
    icon: homeIcon,
  }).addTo(map);

  fetch("./Resource/basemap.json")
    .then(function (res) {
      return res.json();
    })
    .then(function (json) {
      gjmap = L.geoJSON(json, {
        style: {
          color: "#999",
          fill: true,
          fillColor: "#333",
          fillOpacity: 1,
          weight: 1,
          pane: "tilePane",
          attribution: 'Map data <a href="https://www.naturalearthdata.com/">&copy;Natural Earth</a> / <a href="https://www.data.jma.go.jp/developer/gis.html" target="_blank">&copy;JMA</a>',
          renderer: L.svg(),
        },
        onEachFeature: function onEachFeature(feature, layer) {
          if (feature.properties && feature.properties.name) {
            sections.push({
              name: feature.properties.name,
              item: layer,
            });
            var saibunElm = document.createElement("option");
            saibunElm.innerText = feature.properties.name;

            if (setting && setting.home.Section == feature.properties.name) {
              saibunElm.selected = true;
              layer.setStyle({
                fillColor: "#FFF",
              });
            }
            document.getElementById("saibun").appendChild(saibunElm);

            layer.on("click", function (e) {
              gjmap.setStyle({
                fillColor: "#333",
              });
              lat = e.latlng.lat;
              lng = e.latlng.lng;
              markerElm.setLatLng(e.latlng);

              layer.setStyle({
                fillColor: "#FFF",
              });
              document.getElementById("latitude").value = lat;
              document.getElementById("longitude").value = lng;
              var optionElm = Array.from(document.querySelectorAll("#saibun option")).find(function (elm) {
                return elm.innerText == feature.properties.name;
              });
              optionElm.selected = true;
            });
          }
        },
      }).addTo(map);
      fetch("./Resource/World.json")
        .then(function (res) {
          return res.json();
        })
        .then(function (json) {
          worldmap = L.geoJSON(json, {
            style: {
              color: "#444",
              fill: true,
              fillColor: "#222",
              fillOpacity: 1,
              weight: 1,
              pane: "jsonMAPPane",
              interactive: false,
              attribution: '<a href="https://www.naturalearthdata.com/">&copy;Natural Earth</a>',
              renderer: jsonMAPCanvas,
            },
          });

          worldmap.addTo(map);
        });
    });

  var currentZoom = map.getZoom();
  if (currentZoom < 6) {
    document.getElementById("mapcontainer").classList.add("zoomLevel_1");
  } else if (currentZoom < 8) {
    document.getElementById("mapcontainer").classList.add("zoomLevel_2");
  } else if (currentZoom < 9) {
    document.getElementById("mapcontainer").classList.add("zoomLevel_3");
  } else {
    document.getElementById("mapcontainer").classList.add("zoomLevel_4");
  }

  map.on("zoom", function () {
    var currentZoom = map.getZoom();
    document.getElementById("mapcontainer").classList.remove("zoomLevel_1");
    document.getElementById("mapcontainer").classList.remove("zoomLevel_2");
    document.getElementById("mapcontainer").classList.remove("zoomLevel_3");
    document.getElementById("mapcontainer").classList.remove("zoomLevel_4");

    if (currentZoom < 6) {
      document.getElementById("mapcontainer").classList.add("zoomLevel_1");
    } else if (currentZoom < 8) {
      document.getElementById("mapcontainer").classList.add("zoomLevel_2");
    } else if (currentZoom < 9) {
      document.getElementById("mapcontainer").classList.add("zoomLevel_3");
    } else {
      document.getElementById("mapcontainer").classList.add("zoomLevel_4");
    }
  });
  map.on("click", function (e) {
    lat = e.latlng.lat;
    lng = e.latlng.lng;
    document.getElementById("latitude").value = lat;
    document.getElementById("longitude").value = lng;
  });
}

//eslint-disable-next-line
function MapReDraw() {
  gjmap.setStyle({
    fillColor: "#333",
  });
  lat = document.getElementById("latitude").value;
  lng = document.getElementById("longitude").value;
  markerElm.setLatLng([lat, lng]);
  sections
    .find(function (elm) {
      return elm.name == document.getElementById("saibun").value;
    })
    .item.setStyle({
      fillColor: "#FFF",
    });
}

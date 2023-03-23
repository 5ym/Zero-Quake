const workerThreads = require("worker_threads");

var EEWNow = false; //EEW発令中かどうか
var EQDetectID = 0; //独自の地震ID
var EQDetect_List = []; //地震アイテムのリスト
var pointsData = {}; //毎秒クリアされない、観測点のデータ

var historyCount = 10; //比較する件数
var threshold01 = 5; //検出とする観測点数
var threshold01C = 5; //検出とする観測点数【都会】
var threshold02; //1次フラグ条件のPGA増加量[gal]
var threshold03; //2次フラグ条件のPGA増加量[gal]
var threshold04 = 1.5; //1次フラグ条件の震度
var MargeRange = 20; //地震の同定範囲[km]
var MargeRangeC = 35; //地震の同定範囲[km]【都会】
var time00 = 300000; //最初の検出~解除[ms](優先)
var time01 = 10000; //最後の検出~解除[ms]

workerThreads.parentPort.on("message", (message) => {
  if (message.action == "EEWDetect") {
    //観測点ごとのデータを毎秒受信
    EQDetect(message.data, message.date);
  } else if (message.action == "EEWNow") {
    EEWNow = message.data;
  }
});

function EQDetect(data, date) {
  var ptDataTmp;

  var detect0;
  var detect1;
  var detect2;
  var pgaAvr;
  for (const elm of data) {
    if (elm.Point && !elm.IsSuspended) {
      //ポイントごとの処理

      ptDataTmp = pointsData[elm.Code];
      if (!ptDataTmp) {
        //都会かどうか
        var isCity = elm.Region == "東京都" || elm.Region == "千葉県" || elm.Region == "埼玉県" || elm.Region == "神奈川県";
        pointsData[elm.Code] = { detectCount: 0, SUMTmp: [elm.pga], Event: null, oneBeforePGA: elm.pga, isCity: isCity };
        ptDataTmp = pointsData[elm.Code];
      }

      //PGAの10回平均を求める
      pgaAvr =
        ptDataTmp.SUMTmp.reduce(function (acc, cur) {
          return acc + cur;
        }) / ptDataTmp.SUMTmp.length;
      if (!pgaAvr) pgaAvr = 0.03; //平均が求められなければ0.03を代入

      //平均PGAから閾値を決定
      threshold02 = 0.4 * pgaAvr + 0.023;
      threshold03 = 0.5 * pgaAvr + 0.15;
      if (ptDataTmp.isCity) {
        //都会では閾値を大きく
        threshold02 *= 2;
        threshold03 *= 2;
      }

      detect0 = elm.pga - pgaAvr >= threshold02 || elm.shindo >= threshold04; //PGA増加量・震度絶対値で評価
      detect1 = detect0 && ptDataTmp.detectCount > 0; //detect1に加え、detectCountを加えて評価
      detect2 = detect1 && (elm.pga - pgaAvr >= threshold03 || elm.shindo > threshold04);

      elm.detect = detect1;
      elm.detect2 = detect2;

      //連続検出回数（detect1は連続検出回数を指標に含むため、detect0で判定）
      if (detect0) {
        ptDataTmp.detectCount++;
      } else {
        ptDataTmp.detectCount = 0;
      }

      if (!detect2) {
        //PGA平均を求めるためのデータ追加
        ptDataTmp.SUMTmp = ptDataTmp.SUMTmp.slice(0, historyCount - 1);
        ptDataTmp.SUMTmp.push(elm.pga);

        if (!detect1 && ptDataTmp.Event) {
          //検出中ではない場合、地震アイテムから観測点データを削除
          ptDataTmp.Event = null;
          for (const elm2 of EQDetect_List) {
            elm2.Codes = elm2.Codes.filter(function (elm3) {
              return elm3.Code !== elm.Code;
            });
          }
        }
      }
    }
  }

  var MargeRangeTmp;
  //単独点の検知情報をグルーピング
  for (const elm of data) {
    if (elm.detect) {
      var ptDataTmp = pointsData[elm.Code];

      //都会かどうかで閾値調整
      if (ptDataTmp.isCity) {
        threshold01Tmp = threshold01C;
        MargeRangeTmp = MargeRange;
      } else {
        threshold01Tmp = threshold01;
        MargeRangeTmp = MargeRangeC;
      }

      //すでに自観測点が地震アイテムに属していないことを確認
      if (!ptDataTmp.Event) {
        //自観測点が地震アイテムの半径+閾値の範囲内に入っている地震アイテムを探す
        var EQD_ItemTmp = EQDetect_List.find(function (elm2) {
          return geosailing(elm.Location.Latitude, elm.Location.Longitude, elm2.lat, elm2.lng) - elm2.Radius <= Math.max(0, MargeRangeTmp);
        });
        if (EQD_ItemTmp) {
          //EQD_ItemTmpに属する観測点から、自観測点からの距離が閾値以下の観測点があるか確認
          var CodesTmp = EQD_ItemTmp.Codes.find(function (elm3) {
            return geosailing(elm.Location.Latitude, elm.Location.Longitude, elm3.Location.Latitude, elm3.Location.Longitude) <= MargeRangeTmp;
          });

          if (CodesTmp) {
            //地震アイテムに自観測点を追加
            EQD_ItemTmp.Codes.push(elm);
            ptDataTmp.Event = EQD_ItemTmp.id;
            //地震アイテムの「半径」を更新
            var radiusTmp = geosailing(elm.Location.Latitude, elm.Location.Longitude, EQD_ItemTmp.lat, EQD_ItemTmp.lng);
            if (EQD_ItemTmp.Radius < radiusTmp) EQD_ItemTmp.Radius = radiusTmp;
          }
        }
      }

      if (EQD_ItemTmp) {
        //最終検知時間（解除時に使用）を更新
        EQD_ItemTmp.last_Detect = new Date();

        if (EQD_ItemTmp.Codes.length >= threshold01Tmp) {
          //地震アイテムに属する観測点数が閾値以上なら

          //情報をmainプロセスへ送信
          workerThreads.parentPort.postMessage({
            action: "EQDetectAdd",
            data: EQD_ItemTmp,
          });
          EQD_ItemTmp.showed = true; //新地震アイテムかどうかの判別用
        }
      } else if (elm.detect2) {
        //自観測点がどの地震アイテムにも属さず、検知レベルがLv.2以上の場合
        //自観測点を中心とした新規地震アイテム作成
        EQDetect_List.push({ id: EQDetectID, lat: elm.Location.Latitude, lng: elm.Location.Longitude, Codes: [elm], Radius: 0, maxPGA: elm.pga, maxInt: elm.shindo, detectCount: 1, Up: false, Lv: 0, last_Detect: new Date(), origin_Time: new Date(), showed: false });
        EQDetectID++;
      }
    }
  }

  //地震検知解除
  var index = 0;
  for (const elm of EQDetect_List) {
    if (EEWNow || new Date() - elm.origin_Time > time00 || new Date() - elm.last_Detect > time01) {
      //EEW発令中・発生から閾値以上経過・最後の検知から閾値以上経過
      EQDetect_List.splice(index, 1);
      workerThreads.parentPort.postMessage({
        action: "sendDataToMainWindow",
        data: {
          action: "EQDetectFinish",
          data: elm.id,
        },
      });
    }
    index++;
  }

  //mainProcessへ情報送信
  workerThreads.parentPort.postMessage({
    action: "EQDetect_List_Update",
    data: EQDetect_List,
  });
  workerThreads.parentPort.postMessage({
    action: "PointsData_Update",
    data: data,
    date: date,
  });
}

//緯度・経度から2地点間の距離を産出
function geosailing(latA, lngA, latB, lngB) {
  return Math.acos(Math.sin(Math.atan(Math.tan(latA * (Math.PI / 180)))) * Math.sin(Math.atan(Math.tan(latB * (Math.PI / 180)))) + Math.cos(Math.atan(Math.tan(latA * (Math.PI / 180)))) * Math.cos(Math.atan(Math.tan(latB * (Math.PI / 180)))) * Math.cos(lngA * (Math.PI / 180) - lngB * (Math.PI / 180))) * 6371.008;
}
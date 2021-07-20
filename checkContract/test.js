const ssm = new (require('aws-sdk/clients/ssm'))();
const request = require('request-promise');
const crypto = require('crypto');

exports.handler = async (event, context, callback) => {
    
    var data = await ssm.getParameters({
        Names: ['bitflyer-apikey'],
        WithDecryption: true   //暗号化してる場合はtrueで複合化
    }).promise();
    
    const apikey = data.Parameters[0].Value;
    
    data = await ssm.getParameters({
        Names: ['bitflyer-sercretkey'],
        WithDecryption: true   //暗号化してる場合はtrueで複合化
    }).promise();
    
    const sercretKey = data.Parameters[0].Value;
    
    
    let promise = sendRequest(apikey,sercretKey)
    .then((result)=>{
        console.log('---DONE---');
        console.log('typeof:', typeof(result));
        callback(null, result);
    },
    (err)=>{
        console.log('---ERROR---');
        callback(err, 'errorMsg' + err.stack);
    }
    );

    console.log('typeof promise:', typeof(promise));
    console.log('promise:', promise);


    async function sendRequest(apikey, sercretKey){
        return new Promise((resolve, reject) => {
            console.log("promise start")
            var timestamp = Date.now().toString();
            var method = 'GET';
            var path = '/v1/me/getchildorders?product_code=FX_BTC_JPY';
        
            var text = timestamp + method + path;
            var sign = crypto.createHmac('sha256', sercretKey).update(text).digest('hex');
            
            var option = {
              url: 'https://api.bitflyer.jp' + path,
              method: method,
              headers: {
                'ACCESS-KEY': apikey,
                'ACCESS-TIMESTAMP': timestamp,
                'ACCESS-SIGN': sign,
                'Content-Type': 'application/json'
                }
            }
            request(option)
              .then((res) => {
                resolve(res);
              })
              .catch((err) => {
                reject(err);
              });
            console.log("promise end")
        });
    }
};
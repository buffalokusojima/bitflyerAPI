const axios = require('axios');
const crypto = require('crypto');
const API_KEY = process.env["BitFlyerApiKey"];
const SECRET_KEY = process.env["BitFlyerSecretKey"];

exports.handler = async (event, context, callback) => {
    
    const timestamp = Date.now().toString();
    const method = 'GET';
    const path = '/v1/me/getpositions?product_code=FX_BTC_JPY';
    
    const text = timestamp + method + path;
    const sign = crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
    
    const option = {
      url: 'https://api.bitflyer.jp' + path,
      method: method,
      headers: {
        'ACCESS-KEY': API_KEY,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-SIGN': sign,
        'Content-Type': 'application/json'
        }
    };
    
    let data = await axios(option);
        
    if(data.status != 200){
        console.error("Error:",data.response);
        callback(null, makeResponse(
                data.status,
                {message: data.response}
            )
        );
      return;
    }
    
    data = data.data;
    
    if(data.length == 0){
        console.log('No data Found');
        callback(null,makeResponse(
                200,
                {message: 'No data Found'}
            ),
        );
        return;
    }
    
    console.log(data);
    callback(null, makeResponse(
                200,
                {data: data}
            ),
    );
    return;
};


const makeResponse = (statusCode, body) => {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS"
        }
    };
};
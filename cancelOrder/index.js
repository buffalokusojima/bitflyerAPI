const axios = require('axios');
const crypto = require('crypto');
const PARENT_PATH = '/v1/me/cancelparentorder';
const CHILD_PATH = '/v1/me/cancelchildorder';
const API_KEY = process.env["BitFlyerApiKey"];
const SECRET_KEY = process.env["BitFlyerSecretKey"];

exports.handler = async (event, context, callback) => {
    
    let body = JSON.parse(event.body);
    
    console.log(body);
    
    if((!body.child_id && !body.parent_id) || !body.coin_pair){
        console.log("body empty");
            callback(null, makeResponse(
                400,
                {message: "body empty"}),
            );
        return;
    }
    let path;
    if(body.child_id){
        path = CHILD_PATH;
    }else if(body.parent_id){
        path = PARENT_PATH;
    }
    
    if(body.child_id){
        body = JSON.stringify({
            product_code: body.coin_pair,
            child_order_id: body.child_id
        });
    }else if(body.parent_id){
        body = JSON.stringify({
            product_code: body.coin_pair,
            parent_order_acceptance_id: body.parent_id
        });
    }
    
    const timestamp = Date.now().toString();
    const method = 'POST';
    
    const text = timestamp + method + path + body;
    const sign = crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
    
    const option = {
      url: 'https://api.bitflyer.jp' + path,
      method: method,
      headers: {
        'ACCESS-KEY': API_KEY,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-SIGN': sign,
        'Content-Type': 'application/json'
        },
      body: body
    };
    
    const data = await axios(option);
    
    let message;
    if(data.status != 200){
      console.error("Error:",data.response);
      message = data.response;
    }else message = data.body;
    
    console.log(message);
    callback(null, makeResponse(
                data.status,
                {message: message}
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
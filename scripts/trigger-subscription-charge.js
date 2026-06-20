const https = require('https');

// Usage: node --env-file=.env scripts/trigger-subscription-charge.js <subscription_id> [amount]

const subId = process.argv[2];
const chargeAmount = parseFloat(process.argv[3] || '500');

if (!subId) {
  console.error('❌ Error: Please provide a Subscription ID.');
  console.log('Usage: node --env-file=.env scripts/trigger-subscription-charge.js <subscription_id> [amount]');
  process.exit(1);
}

const appId = process.env.CASHFREE_APP_ID;
const secretKey = process.env.CASHFREE_SECRET_KEY;
const isProduction = process.env.CASHFREE_ENV === 'production';

if (!appId || appId === 'your_cashfree_app_id' || !secretKey || secretKey === 'your_cashfree_secret_key') {
  console.error('❌ Error: Cashfree API credentials not found in environment.');
  process.exit(1);
}

// Subscriptions Charge API uses the standard endpoint base
const host = isProduction ? 'api.cashfree.com' : 'sandbox.cashfree.com';
const path = `/pg/subscriptions/pay`;

const chargeId = `CHG_${Date.now()}`;

// Calculate future date (15 minutes from now) in Indian Standard Time (IST, UTC+05:30)
// to prevent server-client timezone mismatch issues with Cashfree's servers.
const localNow = new Date();
const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC + 5:30
const futureIst = new Date(localNow.getTime() + istOffset + 15 * 60 * 1000); // 15 mins in the future

const pad = (n) => n.toString().padStart(2, '0');
const year = futureIst.getUTCFullYear();
const month = pad(futureIst.getUTCMonth() + 1);
const date = pad(futureIst.getUTCDate());
const hours = pad(futureIst.getUTCHours());
const minutes = pad(futureIst.getUTCMinutes());
const seconds = pad(futureIst.getUTCSeconds());

const paymentScheduleDate = `${year}-${month}-${date}T${hours}:${minutes}:${seconds}+05:30`;

const payloadObj = {
  subscription_id: subId,
  payment_id: chargeId,
  payment_amount: chargeAmount,
  payment_type: 'CHARGE',
  payment_schedule_date: paymentScheduleDate,
  payment_remarks: 'Simulated subscription charge via developer helper script'
};

const payload = JSON.stringify(payloadObj);

console.log(`🔌 Connecting to Cashfree Sandbox (${host})...`);
console.log(`📤 Sending charge request for subscription: "${subId}" | Amount: ₹${chargeAmount} | Charge ID: ${chargeId}`);

const options = {
  hostname: host,
  port: 443,
  path: path,
  method: 'POST',
  headers: {
    'x-client-id': appId,
    'x-client-secret': secretKey,
    'x-api-version': '2025-01-01',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`📥 Response Status: ${res.statusCode}`);
    try {
      const parsed = JSON.parse(body);
      console.log('📄 Response Payload:');
      console.log(JSON.stringify(parsed, null, 2));

      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('\n✅ Charge successfully initiated! The webhook will trigger shortly to update the ledger.');
      } else {
        console.log('\n❌ Charge initiation failed. Verify subscription status and payment methods.');
      }
    } catch (e) {
      console.log('📄 Raw Response:', body);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request error:', err.message);
});

req.write(payload);
req.end();

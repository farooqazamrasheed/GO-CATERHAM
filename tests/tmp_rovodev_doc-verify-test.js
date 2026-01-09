/**
 * Test Document Verification and Approval Flow
 */
const http = require('http');

const BASE_URL = 'http://localhost:5000';
const API_PREFIX = '/api/v1';

let adminToken = null;
let testDriverId = null;

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + API_PREFIX + path);
    const bodyData = data ? JSON.stringify(data) : null;
    
    const options = {
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (bodyData) options.headers['Content-Length'] = Buffer.byteLength(bodyData);
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', (e) => reject(e));
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runTest() {
  console.log('=== Document Verification & Approval Flow Test ===\n');

  // 1. Login as admin
  console.log('1. Logging in as superadmin...');
  const loginRes = await makeRequest('POST', '/auth/login', {
    identifier: 'superadmin@gocaterham.com',
    password: 'superADMIN@123',
    role: 'superadmin'
  });
  
  if (loginRes.status !== 200) {
    console.log('   FAILED: Could not login', loginRes.data.message);
    return;
  }
  adminToken = loginRes.data.data.token;
  console.log('   SUCCESS: Logged in as superadmin\n');

  // 2. Get unverified drivers to find one with documents
  console.log('2. Getting unverified drivers...');
  const driversRes = await makeRequest('GET', '/admin/drivers/unverified', null, adminToken);
  console.log(`   Found ${driversRes.data.data?.drivers?.length || 0} unverified drivers\n`);

  // 3. Get a driver with documents uploaded
  console.log('3. Checking driver documents status...');
  const allDriversRes = await makeRequest('GET', '/admin/drivers', null, adminToken);
  const drivers = allDriversRes.data.data?.drivers || [];
  
  let driverWithDocs = null;
  for (const driver of drivers) {
    const docsRes = await makeRequest('GET', `/documents/driver/${driver._id}`, null, adminToken);
    if (docsRes.status === 200) {
      const docs = docsRes.data.data;
      console.log(`   Driver ${driver._id}:`);
      console.log(`     - Uploaded: ${docs.uploadedDocumentsCount}/${docs.totalDocumentsRequired}`);
      console.log(`     - All uploaded: ${docs.allDocumentsUploaded}`);
      console.log(`     - All verified: ${docs.allDocumentsVerified}`);
      
      if (docs.uploadedDocumentsCount > 0) {
        driverWithDocs = driver;
        
        // Show each document status
        console.log('     Documents:');
        for (const [docType, docInfo] of Object.entries(docs.documents)) {
          if (docInfo.uploaded) {
            console.log(`       - ${docType}: uploaded=${docInfo.uploaded}, verified=${docInfo.verified}`);
          }
        }
      }
      console.log('');
    }
  }

  if (!driverWithDocs) {
    console.log('   No driver with documents found. Creating test driver...\n');
    // Skip document testing if no driver with docs
    return;
  }

  testDriverId = driverWithDocs._id;

  // 4. Try to verify a document
  console.log('4. Testing document verification...');
  const docsRes = await makeRequest('GET', `/documents/driver/${testDriverId}`, null, adminToken);
  const docs = docsRes.data.data.documents;
  
  // Find first uploaded but not verified document
  let docToVerify = null;
  for (const [docType, docInfo] of Object.entries(docs)) {
    if (docInfo.uploaded && !docInfo.verified) {
      docToVerify = docType;
      break;
    }
  }

  if (docToVerify) {
    console.log(`   Attempting to verify: ${docToVerify}`);
    const verifyRes = await makeRequest('PUT', `/admin/driver/${testDriverId}/document/${docToVerify}/verify`, null, adminToken);
    console.log(`   Status: ${verifyRes.status}`);
    console.log(`   Message: ${verifyRes.data.message}`);
    if (verifyRes.status !== 200) {
      console.log(`   Error details:`, verifyRes.data);
    }
  } else {
    console.log('   All documents already verified or none uploaded');
  }
  console.log('');

  // 5. Try to approve the driver
  console.log('5. Testing driver approval...');
  const approveRes = await makeRequest('PUT', `/admin/driver/${testDriverId}/approve`, null, adminToken);
  console.log(`   Status: ${approveRes.status}`);
  console.log(`   Message: ${approveRes.data.message}`);
  if (approveRes.status !== 200) {
    console.log('   This is expected if not all documents are uploaded/verified');
  }
  console.log('');

  // 6. Check driver's current status
  console.log('6. Driver current status:');
  const driverRes = await makeRequest('GET', `/admin/drivers/${testDriverId}`, null, adminToken);
  if (driverRes.status === 200) {
    const d = driverRes.data.data.driver || driverRes.data.data;
    console.log(`   - isApproved: ${d.isApproved}`);
    console.log(`   - verificationStatus: ${d.verificationStatus}`);
    console.log(`   - status: ${d.status}`);
  }

  console.log('\n=== Test Complete ===');
}

runTest().catch(console.error);

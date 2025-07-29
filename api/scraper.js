// Import fungsi dari scraper.js (perlu sedikit modifikasi)
const https = require('https');
const querystring = require('querystring');

/**
 * Copy fungsi-fungsi dari scraper.js
 */
function getTokenAndCookie(url, headers) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            let html = '';
            const cookie = res.headers['set-cookie']?.join('; ') || '';
            
            res.on('data', (chunk) => {
                html += chunk;
            });

            res.on('end', () => {
                const tokenRegex = /authenticityToken = '([a-f0-9]+)';/;
                const match = html.match(tokenRegex);
                
                if (match && match[1]) {
                    resolve({ token: match[1], cookie: cookie });
                } else {
                    reject(new Error('Gagal menemukan authenticityToken.'));
                }
            });

        }).on('error', (err) => {
            reject(err);
        });
    });
}

function postForTenderData(url, payload, headers) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify(payload);
        const urlObject = new URL(url);

        const options = {
            hostname: urlObject.hostname,
            path: urlObject.pathname + urlObject.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let jsonResponse = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                jsonResponse += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(jsonResponse));
                } catch (e) {
                    reject(new Error('Gagal mem-parsing respons JSON: ' + e.message));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Test function
 */
async function testScraper() {
    const year = 2025;
    const pageNumber = 1;
    const pageSize = 5;
    
    const baseUrl = 'https://spse.inaproc.id/kemkes';
    const lelangPageUrl = `${baseUrl}/lelang`;
    const dataUrl = `${baseUrl}/dt/lelang?tahun=${year}`;

    const commonHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    };

    console.log(`🚀 Testing scraper untuk tahun ${year}, halaman ${pageNumber}...`);
    console.time('Total Duration');

    try {
        // Step 1: Get token and cookie
        console.log('   [1/3] Mengambil halaman utama...');
        const { token, cookie } = await getTokenAndCookie(lelangPageUrl, commonHeaders);
        console.log(`   [1/3] ✔️ Token ditemukan: ${token.substring(0, 10)}...`);

        // Step 2: Build payload
        const start = (pageNumber - 1) * pageSize;
        const payload = {
            'draw': pageNumber,
            'columns[0][data]': '0', 'columns[0][name]': '', 'columns[0][searchable]': 'true', 'columns[0][orderable]': 'true', 'columns[0][search][value]': '', 'columns[0][search][regex]': 'false',
            'columns[1][data]': '1', 'columns[1][name]': '', 'columns[1][searchable]': 'true', 'columns[1][orderable]': 'true', 'columns[1][search][value]': '', 'columns[1][search][regex]': 'false',
            'columns[2][data]': '2', 'columns[2][name]': '', 'columns[2][searchable]': 'true', 'columns[2][orderable]': 'true', 'columns[2][search][value]': '', 'columns[2][search][regex]': 'false',
            'columns[3][data]': '3', 'columns[3][name]': '', 'columns[3][searchable]': 'false', 'columns[3][orderable]': 'false', 'columns[3][search][value]': '', 'columns[3][search][regex]': 'false',
            'columns[4][data]': '4', 'columns[4][name]': '', 'columns[4][searchable]': 'true', 'columns[4][orderable]': 'true', 'columns[4][search][value]': '', 'columns[4][search][regex]': 'false',
            'columns[5][data]': '5', 'columns[5][name]': '', 'columns[5][searchable]': 'true', 'columns[5][orderable]': 'true', 'columns[5][search][value]': '', 'columns[5][search][regex]': 'false',
            'order[0][column]': '5', 'order[0][dir]': 'desc',
            'start': start,
            'length': pageSize,
            'search[value]': '',
            'search[regex]': 'false',
            'authenticityToken': token
        };
        console.log(`   [2/3] ✔️ Payload untuk halaman ${pageNumber} dibuat.`);

        // Step 3: POST request
        console.log('   [3/3] Mengirim request POST untuk mendapatkan data JSON...');
        const headersForPost = {
            ...commonHeaders,
            'Cookie': cookie,
            'Referer': lelangPageUrl
        };

        const tenderData = await postForTenderData(dataUrl, payload, headersForPost);

        console.log('✅ Berhasil! Data diterima.');
        console.timeEnd('Total Duration');
        
        console.log("\n--- HASIL DATA TENDER ---");
        console.log(`Total records: ${tenderData.recordsTotal || 'N/A'}`);
        console.log(`Records filtered: ${tenderData.recordsFiltered || 'N/A'}`);
        console.log(`Data length: ${tenderData.data?.length || 0}`);
        
        if (tenderData.data && tenderData.data.length > 0) {
            console.log("\nSample data");
            console.log(JSON.stringify(tenderData.data, null, 2));
        }

        return {
            success: true,
            data: tenderData,
            metadata: { year, pageNumber, pageSize }
        };

    } catch (error) {
        console.error("❌ Terjadi kesalahan:", error.message);
        console.timeEnd('Total Duration');
        return {
            success: false,
            error: error.message
        };
    }
}

// Run test
if (require.main === module) {
    testScraper()
        .then(result => {
            console.log('\n=== TEST COMPLETED ===');
            if (result.success) {
                console.log('Status: SUCCESS ✅');
            } else {
                console.log('Status: FAILED ❌');
                console.log('Error:', result.error);
            }
        })
        .catch(err => {
            console.error('Unhandled error:', err);
        });
}

module.exports = { testScraper };

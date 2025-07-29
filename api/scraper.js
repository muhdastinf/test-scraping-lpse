// Import modul yang diperlukan
const https = require('https');
const querystring = require('querystring');

/**
 * Mengambil token dan cookie dari halaman utama lelang.
 */
function getTokenAndCookie(url, headers) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            let html = '';
            const cookie = res.headers['set-cookie']?.join('; ') || '';
            
            res.on('data', (chunk) => {
                html += chunk;
            });

            console.log(html);

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

/**
 * Mengirim request POST untuk mendapatkan data tender.
 */
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
 * Fungsi utama yang menjalankan proses scraping.
 */
async function runScraper(year = 2025, pageNumber = 1, pageSize = 5) {
    const baseUrl = 'https://spse.inaproc.id/kemkes';
    const lelangPageUrl = `${baseUrl}/lelang`;
    const dataUrl = `${baseUrl}/dt/lelang?tahun=${year}`;
    const commonHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    };

    // Step 1: Get token and cookie
    const { token, cookie } = await getTokenAndCookie(baseUrl, commonHeaders);

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

    // Step 3: POST request
    const headersForPost = {
        ...commonHeaders,
        'Cookie': cookie,
        'Referer': lelangPageUrl
    };

    const tenderData = await postForTenderData(dataUrl, payload, headersForPost);

    return {
        success: true,
        data: tenderData,
        metadata: { year, pageNumber, pageSize }
    };
}


/**
 * Handler utama untuk Vercel Serverless Function.
 * Fungsi ini akan menangani permintaan HTTP yang masuk.
 */
export default async function handler(req, res) {
    try {
        // Ambil parameter dari query URL, dengan nilai default jika tidak ada
        const year = req.query.year || 2025;
        const page = req.query.page || 1;
        const size = req.query.size || 5;
        console.log('test');

        // Jalankan scraper dengan parameter tersebut
        const result = await runScraper(parseInt(year), parseInt(page), parseInt(size));

        // Kirim hasil sebagai respons JSON jika berhasil
        res.status(200).json(result);

    } catch (error) {
        // Kirim pesan error jika terjadi kesalahan
        console.error(error); // Log error di sisi server untuk debugging
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

// Run test
// if (require.main === module) {
//     runScraper()
//         .then(result => {
//             console.log('\n=== TEST COMPLETED ===');
//             if (result.success) {
//                 console.log(result.data)
//                 console.log('Status: SUCCESS ✅');
//             } else {
//                 console.log('Status: FAILED ❌');
//                 console.log('Error:', result.error);
//             }
//         })
//         .catch(err => {
//             console.error('Unhandled error:', err);
//         });
// }

// module.exports = { runScraper };

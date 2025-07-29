const https = require('https');
const querystring = require('querystring');

/**
 * Helper function untuk delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fungsi untuk melakukan GET request dengan retry
 */
function getTokenAndCookie(url, headers, retries = 2) {
    return new Promise(async (resolve, reject) => {
        for (let i = 0; i <= retries; i++) {
            try {
                if (i > 0) {
                    console.log(`Retry attempt ${i}...`);
                    await delay(1000 * i); // Delay progressive
                }

                const result = await new Promise((res, rej) => {
                    https.get(url, { headers }, (response) => {
                        let html = '';
                        const cookie = response.headers['set-cookie']?.join('; ') || '';
                        
                        response.on('data', (chunk) => {
                            html += chunk;
                        });

                        response.on('end', () => {
                            // Debug: Log partial HTML content
                            console.log('Response status:', response.statusCode);
                            console.log('HTML preview (first 200 chars):', html.substring(0, 200));
                            
                            const tokenRegex = /authenticityToken = '([a-f0-9]+)';/;
                            const match = html.match(tokenRegex);
                            
                            if (match && match[1]) {
                                res({ token: match[1], cookie: cookie });
                            } else {
                                // Try alternative token patterns
                                const altRegex1 = /name="authenticity_token"[^>]*value="([^"]+)"/;
                                const altRegex2 = /_token['"]\s*:\s*['"]([^'"]+)['"]/;
                                const altMatch1 = html.match(altRegex1);
                                const altMatch2 = html.match(altRegex2);
                                
                                if (altMatch1 && altMatch1[1]) {
                                    console.log('Found alternative token pattern 1');
                                    res({ token: altMatch1[1], cookie: cookie });
                                } else if (altMatch2 && altMatch2[1]) {
                                    console.log('Found alternative token pattern 2');
                                    res({ token: altMatch2[1], cookie: cookie });
                                } else {
                                    rej(new Error(`Gagal menemukan authenticityToken. HTML length: ${html.length}. Status: ${response.statusCode}`));
                                }
                            }
                        });

                    }).on('error', (err) => {
                        rej(err);
                    });
                });

                return resolve(result);
            } catch (error) {
                console.log(`Attempt ${i + 1} failed:`, error.message);
                if (i === retries) {
                    reject(error);
                }
            }
        }
    });
}

/**
 * Fungsi untuk melakukan POST request dan mengambil data tender.
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
                    const parsed = JSON.parse(jsonResponse);
                    resolve(parsed);
                } catch (e) {
                    console.log('JSON Parse Error:', e.message);
                    console.log('Response received:', jsonResponse.substring(0, 500));
                    reject(new Error('Gagal mem-parsing respons JSON: ' + e.message));
                }
            });
        });

        req.on('error', (e) => {
            console.log('Request Error:', e.message);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Main handler function untuk Vercel
 */
module.exports = async function handler(req, res) {
    console.log('Function started:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('Query:', req.query);
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Ambil parameter dari query atau body
        const { year = 2025, pageNumber = 1, pageSize = 5 } = req.method === 'POST' ? req.body : req.query;
        
        console.log(`Processing request - Year: ${year}, Page: ${pageNumber}, Size: ${pageSize}`);
        
        const baseUrl = 'https://spse.inaproc.id/kemkes';
        const lelangPageUrl = `${baseUrl}/lelang`;
        const dataUrl = `${baseUrl}/dt/lelang?tahun=${year}`;

        // Randomize User-Agent untuk menghindari deteksi
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        const commonHeaders = {
            'User-Agent': randomUA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
        };

        console.log('Getting token and cookie...');
        // Langkah 1: Dapatkan token dan cookie
        const { token, cookie } = await getTokenAndCookie(lelangPageUrl, commonHeaders);
        console.log(`Token obtained: ${token.substring(0, 10)}...`);
        
        // Langkah 2: Bangun payload
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

        // Langkah 3: Lakukan POST request
        const headersForPost = {
            ...commonHeaders,
            'Cookie': cookie,
            'Referer': lelangPageUrl
        };

        console.log('Posting for tender data...');
        const tenderData = await postForTenderData(dataUrl, payload, headersForPost);
        console.log('Data received successfully');

        // Return JSON response
        res.status(200).json({
            success: true,
            data: tenderData,
            metadata: {
                year: parseInt(year),
                pageNumber: parseInt(pageNumber),
                pageSize: parseInt(pageSize),
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error("Error in handler:", error.message);
        console.error("Error stack:", error.stack);
        
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

const https = require('https');
const querystring = require('querystring');

/**
 * Helper function untuk delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate realistic headers untuk menghindari deteksi bot
 */
function generateRealisticHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    return {
        'User-Agent': randomUA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    };
}

/**
 * Fungsi untuk melakukan GET request dengan retry dan delay
 */
function getTokenAndCookie(url, headers, retries = 3) {
    return new Promise(async (resolve, reject) => {
        for (let i = 0; i <= retries; i++) {
            try {
                if (i > 0) {
                    console.log(`Retry attempt ${i}... waiting ${2000 * i}ms`);
                    await delay(2000 * i); // Delay lebih lama dan progressive
                }

                // Random delay sebelum request untuk meniru behavior manusia
                await delay(Math.random() * 1000 + 500);

                const result = await new Promise((res, rej) => {
                    const req = https.get(url, { headers }, (response) => {
                        let html = '';
                        const cookie = response.headers['set-cookie']?.join('; ') || '';
                        
                        console.log('Response status:', response.statusCode);
                        console.log('Response headers:', Object.keys(response.headers));
                        
                        // Handle different status codes
                        if (response.statusCode === 403) {
                            rej(new Error(`Access forbidden (403). Server detected automation. Headers: ${JSON.stringify(response.headers)}`));
                            return;
                        }
                        
                        if (response.statusCode === 429) {
                            rej(new Error(`Rate limited (429). Too many requests.`));
                            return;
                        }
                        
                        if (response.statusCode !== 200) {
                            rej(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                            return;
                        }
                        
                        response.on('data', (chunk) => {
                            html += chunk;
                        });

                        response.on('end', () => {
                            console.log('HTML length received:', html.length);
                            console.log('HTML preview (first 300 chars):', html.substring(0, 300));
                            
                            // Coba beberapa pattern token
                            const tokenPatterns = [
                                /authenticityToken = '([a-f0-9]+)';/,
                                /name="authenticity_token"[^>]*value="([^"]+)"/,
                                /_token['"]\s*:\s*['"]([^'"]+)['"]/,
                                /csrf[_-]?token['"]\s*:\s*['"]([^'"]+)['"]/i,
                                /authenticity_token['"]\s*:\s*['"]([^'"]+)['"]/,
                                /<meta[^>]+name=['"](csrf-token|_token|authenticity_token)['"]\s+content=['"]([^'"]+)['"]/i
                            ];
                            
                            let token = null;
                            let patternUsed = null;
                            
                            for (let j = 0; j < tokenPatterns.length; j++) {
                                const match = html.match(tokenPatterns[j]);
                                if (match && match[1]) {
                                    token = match[1];
                                    patternUsed = j + 1;
                                    break;
                                } else if (match && match[2]) {
                                    token = match[2];
                                    patternUsed = j + 1;
                                    break;
                                }
                            }
                            
                            if (token) {
                                console.log(`Token found using pattern ${patternUsed}: ${token.substring(0, 10)}...`);
                                res({ token, cookie });
                            } else {
                                // Log bagian HTML yang mungkin mengandung token
                                const relevantParts = [
                                    html.match(/authenticity[^}]+/gi),
                                    html.match(/csrf[^}]+/gi),
                                    html.match(/_token[^}]+/gi)
                                ].filter(Boolean);
                                
                                console.log('Relevant HTML parts:', relevantParts);
                                rej(new Error(`Token tidak ditemukan dengan semua pattern. HTML length: ${html.length}. Status: ${response.statusCode}`));
                            }
                        });

                    });

                    req.on('error', (err) => {
                        console.log('Request error:', err.message);
                        rej(err);
                    });

                    // Set timeout untuk request
                    req.setTimeout(15000, () => {
                        req.destroy();
                        rej(new Error('Request timeout'));
                    });
                });

                return resolve(result);
            } catch (error) {
                console.log(`Attempt ${i + 1} failed:`, error.message);
                if (i === retries) {
                    reject(error);
                }
                
                // Jika 403, tunggu lebih lama sebelum retry
                if (error.message.includes('403')) {
                    await delay(5000 + (i * 2000));
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
                'Content-Length': Buffer.byteLength(postData),
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://spse.inaproc.id'
            }
        };

        const req = https.request(options, (res) => {
            let jsonResponse = '';
            res.setEncoding('utf8');
            
            console.log('POST Response status:', res.statusCode);
            
            res.on('data', (chunk) => {
                jsonResponse += chunk;
            });
            
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        reject(new Error(`POST request failed: ${res.statusCode} - ${jsonResponse}`));
                        return;
                    }
                    
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
            console.log('POST Request Error:', e.message);
            reject(e);
        });

        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('POST request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Main handler function untuk Vercel
 */
module.exports = async function handler(req, res) {
    console.log('=== Function started ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('Query:', req.query);
    console.log('User IP:', req.headers['x-forwarded-for'] || req.connection.remoteAddress);
    
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

        // Generate headers dengan randomization
        const commonHeaders = generateRealisticHeaders();
        console.log('Using User-Agent:', commonHeaders['User-Agent'].substring(0, 50) + '...');

        // Initial delay untuk meniru behavior manusia
        await delay(1000 + Math.random() * 2000);

        console.log('=== Step 1: Getting token and cookie ===');
        console.log('URL:', lelangPageUrl);
        
        // Langkah 1: Dapatkan token dan cookie
        const { token, cookie } = await getTokenAndCookie(lelangPageUrl, commonHeaders);
        console.log(`✓ Token obtained: ${token.substring(0, 10)}...`);
        console.log(`✓ Cookie length: ${cookie.length}`);
        
        // Delay sebelum POST request
        await delay(1500 + Math.random() * 1000);
        
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

        console.log('=== Step 2: Preparing POST request ===');
        console.log('POST URL:', dataUrl);
        
        // Langkah 3: Lakukan POST request
        const headersForPost = {
            ...commonHeaders,
            'Cookie': cookie,
            'Referer': lelangPageUrl
        };

        console.log('=== Step 3: Executing POST request ===');
        const tenderData = await postForTenderData(dataUrl, payload, headersForPost);
        console.log('✓ Data received successfully');
        console.log('Records total:', tenderData.recordsTotal);
        console.log('Data length:', tenderData.data?.length);

        // Return JSON response
        res.status(200).json({
            success: true,
            data: tenderData,
            metadata: {
                year: parseInt(year),
                pageNumber: parseInt(pageNumber),
                pageSize: parseInt(pageSize),
                timestamp: new Date().toISOString(),
                serverInfo: {
                    userAgent: commonHeaders['User-Agent'],
                    tokenPreview: token.substring(0, 10) + '...'
                }
            }
        });

    } catch (error) {
        console.error("=== ERROR OCCURRED ===");
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            debug: {
                errorType: error.constructor.name,
                stage: error.message.includes('token') ? 'token_extraction' : 
                       error.message.includes('403') ? 'access_forbidden' :
                       error.message.includes('POST') ? 'data_request' : 'unknown'
            }
        });
    }
};

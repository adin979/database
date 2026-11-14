
export default async function customFetch(url,option={}){
    const serializeBody=option.body&&typeof option.body !== 'string'&&!(option.body instanceof FormData)?JSON.stringify(option.body):option.body
    option.headers={
        'Authorization':`Bearer ${localStorage.getItem('token')}`,
        ...option.headers
    }
    option['credentials']='include'
    option.body=serializeBody
    if(typeof serializeBody==='string')option.headers['Content-type']='application/json'
    let response
    try {
        response = await fetch(url,option)
        if(response.status === 401 || response.status === 403){
            const newToken = await refreshTokens()
            option.headers['Authorization']=`Bearer ${newToken}`
            response = await fetch(url,option)
        }
    } catch (error) {
      throw error  
    }
    return await response
}

async function refreshTokens() {
    const response = await fetch('/api/system/refresh-token',{
        method:'POST',
        headers:{'Content-type':'application/json'},
        credentials:"include"
    })
    const data=await response.json()
    const newToken = data.accessToken
    return newToken
}
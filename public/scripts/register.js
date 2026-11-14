import customFetch from "./customFetch.js"

export default function register(){
        document.querySelector('#reg').addEventListener('submit',(e)=>{
            e.preventDefault()
            const [username,password] = e.target.elements
            const uname=username.value
            const pass=password.value
            customFetch('/api/system/register',{
                method:'POST',
                body:{
                    username:uname,
                    password:pass
                }
            })
            .then(response=>response.json())
            .then(result=>{
                if(!result.success){alert(result.error);return}
                alert('Registrasi berhasil!')
                customFetch('/api/system/login',{
                    method:'POST',
                    body:{
                        username:uname,
                        password:pass
                    }
                })
                .then(response=>response.json())
                .then(data=>{
                    if(!data.success)alert(data.error)
                    console.log(data)
                    localStorage.setItem('token',data.token)
                    window.location.replace('/')
                })  
            })
            .catch(error=>console.log(error))
        })
    }

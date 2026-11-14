import customFetch from "./customFetch.js"

export default function init(){
        document.querySelector('#form-login').addEventListener('submit',(e)=>{
            e.preventDefault()
            const [uname,pwd] = e.target.elements
            customFetch('/api/system/login',{
                method:'POST',
                body:{
                    username:uname.value,
                    password:pwd.value
                }
            })
            .then(response=>response.json())
            .then(result=>{
                if(!result.success){alert(result.error);return}
                localStorage.setItem('token',result.token)
                alert('login berhasil')
                location.replace('/')
            })
            .catch(error=>alert(error.error))
        })
    }
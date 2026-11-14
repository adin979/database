import customFetch from "./customFetch.js"

export default{
    title:'Register Page',
    async getTemplate(){
        const response =await fetch('./views/register.html')
        return await response.text()
    },
    init(root,state){
        root.querySelector('#reg').addEventListener('submit',(e)=>{
            e.preventDefault()
            const [username,password] = e.target.elements
            state.username=username.value
            state.password=password.value
            customFetch('/api/system/register',{
                method:'POST',
                body:{
                    username:state.username,
                    password:state.password
                }
            })
            .then(response=>response.json())
            .then(result=>{
                if(!result.success){alert(result.error);return}
                alert('Registrasi berhasil!')
                customFetch('/api/system/login',{
                    method:'POST',
                    body:{
                        username:state.username,
                        password:state.password
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
}
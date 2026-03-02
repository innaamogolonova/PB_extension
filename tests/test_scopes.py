global_var = "I'm global"
def my_function(param):
    local_var = "I'm local"
    print(param, local_var, global_var)
my_function("test")
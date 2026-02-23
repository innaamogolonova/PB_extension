import requests
import random

# This will query the API for a pokemon's data(in this case pokemon 906, floragato), at https://pokeapi.co/api/v2/pokemon/906
# Querying at https://pokeapi.co/api/v2/pokemon/1 will produce a super long output, good for stress testing?

def test_massive_api_noise():
    
    # Pokemon test (short API response)
    pokemon = requests.get("https://pokeapi.co/api/v2/pokemon/906").json()
    
    # Pokemon test (long API response)
    #pokemon = requests.get("https://pokeapi.co/api/v2/pokemon/1").json()
    
    # Pokemon test (random)
    #pokemon = requests.get(f"https://pokeapi.co/api/v2/pokemon/{random.randint(1, 1025)}").json()
    
    return pokemon

if __name__ == "__main__":
    final = test_massive_api_noise()

    print("\n=== API CALL RESULTS ===\n")
    print(final)
    print("\n=== Desired/Important Value ===\n")
    
    print(final["name"])
    print("\n=== \"Second\" Most Important Value ===\n")
    print(final["species"])
    species = requests.get(final["species"]["url"]).json()
    if species["evolves_from_species"] != None:
        print("\n" + final["name"] + " evolves from " + species["evolves_from_species"]["name"])
    else:
        print(final["name"] + " is a base-stage pokemon")
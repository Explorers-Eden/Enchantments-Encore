##runs as the player after a catch with a Scholar of Fishing rod
advancement revoke @s only enchantencore:technical/scholar_of_fishing

execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:scholar_of_fishing",levels:1}]] run return run xp add @s 2 points
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:scholar_of_fishing",levels:2}]] run return run xp add @s 4 points
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:scholar_of_fishing",levels:3}]] run return run xp add @s 6 points

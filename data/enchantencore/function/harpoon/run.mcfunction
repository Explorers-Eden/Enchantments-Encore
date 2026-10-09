##runs as the player the moment a mob is reeled in with a Harpoon rod (bobber still exists)
advancement revoke @s only enchantencore:technical/harpoon

scoreboard players set $harpoon.factor enchantencore.technical 0
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:harpoon",levels:1}]] run scoreboard players set $harpoon.factor enchantencore.technical 18
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:harpoon",levels:2}]] run scoreboard players set $harpoon.factor enchantencore.technical 24
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:harpoon",levels:3}]] run scoreboard players set $harpoon.factor enchantencore.technical 30
execute if score $harpoon.factor enchantencore.technical matches 0 run return fail

execute store result score $harpoon.px enchantencore.technical run data get entity @s Pos[0] 100
execute store result score $harpoon.py enchantencore.technical run data get entity @s Pos[1] 100
execute store result score $harpoon.pz enchantencore.technical run data get entity @s Pos[2] 100

tag @s add ee.harpoon.self
execute as @e[type=minecraft:fishing_bobber,distance=..64] at @s on origin if entity @s[tag=ee.harpoon.self] as @n[type=!#enchantencore:non_living,type=!minecraft:player,distance=..3] run function enchantencore:harpoon/pull
tag @s remove ee.harpoon.self

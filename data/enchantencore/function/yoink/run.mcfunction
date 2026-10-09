##runs as the player the moment a mob is reeled in with a Yoink rod (bobber still exists)
advancement revoke @s only enchantencore:technical/yoink

scoreboard players set $yoink.chance enchantencore.technical 0
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:yoink",levels:1}]] run scoreboard players set $yoink.chance enchantencore.technical 40
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:yoink",levels:2}]] run scoreboard players set $yoink.chance enchantencore.technical 70
execute if items entity @s weapon.* #minecraft:enchantable/fishing[minecraft:enchantments~[{enchantments:"enchantencore:yoink",levels:3}]] run scoreboard players set $yoink.chance enchantencore.technical 100
execute if score $yoink.chance enchantencore.technical matches 0 run return fail
execute store result score $yoink.roll enchantencore.technical run random value 1..100
execute if score $yoink.roll enchantencore.technical > $yoink.chance enchantencore.technical run return fail

tag @s add ee.yoink.self
execute as @e[type=minecraft:fishing_bobber,distance=..64] at @s on origin if entity @s[tag=ee.yoink.self] as @n[type=!#enchantencore:non_living,type=!minecraft:player,distance=..3] run function enchantencore:yoink/steal
tag @s remove ee.yoink.self

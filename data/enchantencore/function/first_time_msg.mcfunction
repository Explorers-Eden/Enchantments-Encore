scoreboard players set $datapack_info enchantencore.technical 1

execute at @s run playsound minecraft:entity.chicken.egg neutral @s ~ ~ ~ .6 2
tellraw @s [\
    {"bold":false,"color":"white","italic":false,"text":"Thank you for giving "},\
    {"bold":true,"color":"dark_purple","italic":false,"text":"Enchantments Encore"},\
    {"bold":false,"color":"white","italic":false,"text":" a shot!"}\
]
tellraw @s " "
tellraw @s {"bold":false,"color":"white","italic":false,"text":"If you're running the data pack in singleplayer or on a server, or the mod version on a server, I'd suggest also loading the latest data pack version as a resource pack - otherwise some descriptions might not show up right."}\
    
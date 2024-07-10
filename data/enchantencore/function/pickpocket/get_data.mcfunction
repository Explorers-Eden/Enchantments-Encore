data modify storage enchantencore:villager count_0 set value 0
data modify storage enchantencore:villager id_0 set value air

data modify storage enchantencore:villager count_0 set from entity @n[type=minecraft:villager,distance=..16] Inventory[0].count
data modify storage enchantencore:villager id_0 set from entity @n[type=minecraft:villager,distance=..16] Inventory[0].id

function enchantencore:pickpocket/get_items with storage enchantencore:villager
advancement revoke @s only enchantencore:technical/pickpocket
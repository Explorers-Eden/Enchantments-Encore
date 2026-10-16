data modify storage enchantencore:refuel hand set value "weapon.offhand"
data modify storage enchantencore:refuel ref set from entity @s equipment.offhand
data remove storage enchantencore:refuel ref.count

data modify storage enchantencore:refuel cand set value []
data modify storage enchantencore:refuel cand append from entity @s Inventory[{id:"minecraft:firework_rocket"}]

function enchantencore:refuel/check

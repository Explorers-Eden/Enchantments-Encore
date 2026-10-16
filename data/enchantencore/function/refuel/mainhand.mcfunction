data modify storage enchantencore:refuel hand set value "weapon.mainhand"
data modify storage enchantencore:refuel ref set from entity @s SelectedItem
data remove storage enchantencore:refuel ref.count

data modify storage enchantencore:refuel cand set value []
data modify storage enchantencore:refuel cand append from entity @s Inventory[{id:"minecraft:firework_rocket"}]

##exclude the held stack itself
execute store result storage enchantencore:refuel skip int 1 run data get entity @s SelectedItemSlot
function enchantencore:refuel/skip with storage enchantencore:refuel

function enchantencore:refuel/check

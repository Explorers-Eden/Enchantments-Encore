##walk the candidates from the back so the main inventory is drained before the hotbar
execute unless data storage enchantencore:refuel cand[-1] run return 0

data modify storage enchantencore:refuel tmp set from storage enchantencore:refuel cand[-1]
execute store result storage enchantencore:refuel slot int 1 run data get storage enchantencore:refuel tmp.Slot
data remove storage enchantencore:refuel tmp.count
data remove storage enchantencore:refuel tmp.Slot

##only take rockets that are identical to the held ones (same flight duration, name, etc.)
execute store success score #refuel_diff enchantencore.technical run data modify storage enchantencore:refuel tmp set from storage enchantencore:refuel ref
execute if score #refuel_diff enchantencore.technical matches 0 run return run function enchantencore:refuel/transfer with storage enchantencore:refuel

data remove storage enchantencore:refuel cand[-1]
function enchantencore:refuel/check

const { Seq } = require("immutable");
const { Node, Test, Serial, Concurrent } = require("./node");

const isTest = Node.contains(Test);
const isSerial = Node.contains(Serial);
const isConcurrent = Node.contains(Concurrent);
const hasBlock = node =>
    isTest(node) || isSerial(node) || isConcurrent(node);


module.exports = function findScope(position, node, parent)
{
    if (!hasBlock(node))
        return false;

    if (isTest(node) && parent && isSerial(parent))
        return false;

    if (!inSource(position, node.source))
        return false;

    // Note: Seq.map is lazy, so although this appears like it will perform the
    // initial search on every child due to the `map`, we'll actually exit early
    // as soon as we find a match.
    const child = Seq(node.contents.block.children)
        .map(node => findScope(position, node))
        .find(node => !!node);

    return child || node && node.contents.block.id;
}

function inSource({ line, column }, { start, end })
{
    return  line > start.line && line < end.line ||
            line === start.line && column > start.column ||
            line === end.line && column < end.column;
}
